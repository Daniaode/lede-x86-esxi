'use strict';
'require view';
'require form';
'require uci';
'require ui';
'require rpc';
'require poll';
'require dom';

var callUpdate = rpc.declare({
	object: 'luci.online-update',
	method: 'exec',
	params: [ 'command', 'args' ],
	expect: {}
});

function run(command, args) {
	return L.resolveDefault(callUpdate(command, args || []), {});
}

function kv(res) {
	var out = {};
	var txt = (res && res.stdout) || '';
	txt.split('\n').forEach(function(line) {
		var i = line.indexOf('=');
		if (i > 0) out[line.substring(0, i)] = line.substring(i + 1);
	});
	return out;
}

return view.extend({
	load: function() {
		return Promise.all([
			uci.load('online-update'),
			run('status'),
			run('check'),
			run('jobstatus')
		]);
	},

	render: function(data) {
		var status = kv(data[1]);
		var check = kv(data[2]);
		var job = kv(data[3]);

		var cur = status.CURRENT || 'unknown';
		var lat = check.LATEST || '—';
		var avail = (check.UPDATE_AVAILABLE === '1');
		var spaceOk = (check.SPACE_OK !== '0');
		var view = this;

		this._tag = lat;

		var container = E('div', { 'class': 'cbi-map' }, [
			E('h2', {}, _('Online Update')),
			E('div', { 'class': 'cbi-map-descr' },
				_('Checks a fixed release repository for newer firmware. Nothing is downloaded or installed without your confirmation.')),

			E('div', { 'class': 'cbi-section' }, [
				this.row(_('Current version'), cur),
				this.row(_('Latest version'), lat),
				this.row(_('Repository'), status.REPO || '—'),
				this.row(_('Last check'), check.CHECKED_AT || _('just performed'))
			]),

			E('div', { 'class': 'cbi-section', 'id': 'ou-actions' }, [
				E('h3', {}, _('Actions')),
				this.actionBlock(avail, spaceOk, check, job)
			]),

			this.progressBlock(job),
			this.settingsSection(),
			this.ignoredSection(status)
		]);

		if (job.STATE === 'RUNNING')
			this.startPolling();

		return container;
	},

	row: function(label, value) {
		return E('div', { 'class': 'cbi-value' }, [
			E('label', { 'class': 'cbi-value-title' }, label),
			E('div', { 'class': 'cbi-value-field' }, String(value))
		]);
	},

	actionBlock: function(avail, spaceOk, check, job) {
		var view = this;

		if (job.STATE === 'VERIFIED')
			return E('div', {}, [
				E('p', {}, _('Firmware %s downloaded and verified (SHA256 OK).').format(job.TAG || '')),
				E('label', {}, [
					E('input', { 'type': 'checkbox', 'id': 'ou-keep', 'checked': 'checked' }),
					' ', _('Keep configuration')
				]),
				E('div', { 'style': 'margin-top:8px' }, [
					E('button', {
						'class': 'cbi-button cbi-button-action important',
						'click': ui.createHandlerFn(view, 'handleApply')
					}, _('Install and reboot')),
					' ',
					E('button', {
						'class': 'cbi-button',
						'click': ui.createHandlerFn(view, 'handleDiscard')
					}, _('Discard'))
				])
			]);

		if (job.STATE === 'RUNNING' || job.STATE === 'APPLYING')
			return E('em', {}, _('Operation in progress, see below.'));

		if (!avail)
			return E('div', {}, [
				E('em', {}, check.RESULT === 'ignored'
					? _('This version is ignored. Restore the prompt below to be notified again.')
					: _('No newer firmware available.')),
				' ',
				E('button', {
					'class': 'cbi-button',
					'click': ui.createHandlerFn(view, 'handleRecheck')
				}, _('Check again'))
			]);

		if (!spaceOk)
			return E('div', {}, [
				E('em', {}, _('Not enough free space on /overlay (need 400 MB).')),
				' ',
				E('button', { 'class': 'cbi-button', 'click': ui.createHandlerFn(view, 'handleRecheck') },
					_('Check again'))
			]);

		return E('div', {}, [
			E('button', {
				'class': 'cbi-button cbi-button-action important',
				'click': ui.createHandlerFn(view, 'handleDownload', check)
			}, _('Update online to %s').format(check.LATEST || '')),
			' ',
			E('button', {
				'class': 'cbi-button',
				'click': function(ev) {
					ev.preventDefault();
					if (check.NOTES_URL) window.open(check.NOTES_URL, '_blank');
				}
			}, _('Download manually')),
			' ',
			E('button', {
				'class': 'cbi-button',
				'click': ui.createHandlerFn(view, 'handleIgnore', check.LATEST)
			}, _('Do not remind me'))
		]);
	},

	progressBlock: function(job) {
		if (!job.STATE || job.STATE === 'IDLE')
			return E('div');

		var label = {
			RUNNING: _('Downloading and verifying…'),
			VERIFIED: _('Download complete.'),
			APPLYING: _('Installing, the device will reboot…'),
			ERROR: _('Failed.')
		}[job.STATE] || job.STATE;

		return E('div', { 'class': 'cbi-section', 'id': 'ou-progress' }, [
			E('h3', {}, _('Status')),
			E('p', {}, label),
			job.MESSAGE ? E('pre', {}, job.MESSAGE) : E('span'),
			job.TAG ? E('p', {}, _('Release: %s').format(job.TAG)) : E('span')
		]);
	},

	settingsSection: function() {
		var m = new form.Map('online-update', _('Automatic checks'),
			_('The background timer only refreshes the status. It never installs anything.'));

		var s = m.section(form.NamedSection, 'main', 'online-update');
		s.anonymous = true;

		var o = s.option(form.Flag, 'check_enabled', _('Enable automatic checks'));
		o.rmempty = false;

		o = s.option(form.Value, 'auto_check_hours', _('Check interval (hours)'));
		o.datatype = 'uinteger';
		o.placeholder = '24';
		o.default = '24';

		return m.render();
	},

	ignoredSection: function(status) {
		var ignored = (status.IGNORED || '').trim().split(/\s+/).filter(Boolean);
		var view = this;

		return E('div', { 'class': 'cbi-section' }, [
			E('h3', {}, _('Ignored versions')),
			ignored.length === 0
				? E('em', {}, _('None'))
				: E('div', {}, ignored.map(function(v) {
					return E('div', { 'class': 'cbi-value' }, [
						E('span', {}, v), ' ',
						E('button', {
							'class': 'cbi-button cbi-button-reset',
							'click': ui.createHandlerFn(view, 'handleUnignore', v)
						}, _('Restore prompt'))
					]);
				}))
		]);
	},

	startPolling: function() {
		poll.add(L.bind(function() {
			return run('jobstatus').then(L.bind(function(res) {
				var job = kv(res);
				if (job.STATE !== 'RUNNING') {
					poll.remove(this._pollFn);
					window.location.reload();
				}
			}, this));
		}, this), 3);
	},

	handleRecheck: function() {
		ui.showModal(_('Checking…'), [
			E('p', { 'class': 'spinning' }, _('Contacting the release repository.'))
		]);
		return run('check').then(function() {
			window.location.reload();
		});
	},

	handleDownload: function(ev, check) {
		ev.preventDefault();
		var view = this;

		ui.showModal(_('Update to %s').format(check.LATEST || ''), [
			E('p', {}, _('The firmware will be downloaded to /overlay and its SHA256 verified against the release manifest. You will be asked to confirm again before it is installed.')),
			E('div', { 'class': 'right' }, [
				E('button', { 'class': 'cbi-button', 'click': ui.hideModal }, _('Cancel')),
				' ',
				E('button', {
					'class': 'cbi-button cbi-button-action important',
					'click': function() {
						ui.hideModal();
						return run('start').then(function() {
							window.location.reload();
						});
					}
				}, _('Start download'))
			])
		]);
	},

	handleApply: function(ev) {
		ev.preventDefault();

		var keep = document.getElementById('ou-keep');
		var keepVal = (keep && keep.checked) ? '1' : '0';

		uci.set('online-update', 'main', 'keep_config', keepVal);
		uci.save();
		uci.apply();

		ui.showModal(_('Installing…'), [
			E('p', { 'class': 'spinning' }, _('Writing the image. The device will reboot; the page will disconnect.'))
		]);

		/* The helper detaches sysupgrade, so this resolves immediately. A
		   timeout can still race an unlucky slow reply; it must not surface
		   as an unhandled rejection error dialog while the flash is actually
		   running, so treat it as "already started" and keep the modal. */
		return run('apply').then(function(res) {
			var out = (res && res.stdout) || '';
			var err = (res && res.stderr) || '';
			if (out.indexOf('RESULT=started') !== -1)
				return;
			if (out.indexOf('RESULT') === -1 && err) {
				ui.hideModal();
				ui.addNotification(null, E('pre', {}, err), 'danger');
			}
		}).catch(function() {
			/* Timeout or dropped connection: the write has been handed off,
			   so keep the "Installing…" modal and let the reboot finish. */
		});
	},

	handleDiscard: function(ev) {
		ev.preventDefault();
		return run('cleanup').then(function() {
			window.location.reload();
		});
	},

	handleIgnore: function(ev, tag) {
		ev.preventDefault();
		return run('ignore', [ tag ]).then(function() {
			ui.addNotification(null, E('p', {}, _('You will not be reminded about %s.').format(tag)), 'info');
			window.location.reload();
		});
	},

	handleUnignore: function(ev, tag) {
		ev.preventDefault();
		return run('unignore', [ tag ]).then(function() {
			ui.addNotification(null, E('p', {}, _('Prompt restored for %s.').format(tag)), 'info');
			window.location.reload();
		});
	}
});
