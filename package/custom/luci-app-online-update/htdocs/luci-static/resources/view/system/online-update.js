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

/* States that mean "a worker is running, keep polling".
   CHECKING/DOWNLOADING/VERIFYING/APPLYING all belong here: the previous
   version only kept polling on RUNNING, so any other in-flight state stopped
   the poll and reloaded the page mid-operation. */
var IN_PROGRESS = [ 'CHECKING', 'DOWNLOADING', 'VERIFYING', 'APPLYING' ];

/* Resolved at call time, not at module scope: _() is a runtime global, so
   translating while the module is being evaluated would either throw or
   freeze the untranslated string. */
function stageLabel(state) {
	switch (state) {
	case 'CHECKING':    return _('Checking the release repository…');
	case 'DOWNLOADING': return _('Downloading firmware…');
	case 'VERIFYING':   return _('Verifying SHA256…');
	case 'VERIFIED':    return _('Verified, ready to install');
	case 'APPLYING':    return _('Writing the image, the device will reboot…');
	case 'ERROR':       return _('Failed.');
	default:            return state;
	}
}

var PROXY_PRESETS = {
	'direct':      '',
	'gh-proxy':    'https://gh-proxy.com/',
	'ghfast':      'https://ghfast.top/',
	'hk-gh-proxy': 'https://hk.gh-proxy.com/',
	'custom':      null
};

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

function fmtBytes(n) {
	n = parseInt(n, 10) || 0;
	if (n >= 1073741824) return '%.1f GB'.format(n / 1073741824);
	if (n >= 1048576) return '%.1f MB'.format(n / 1048576);
	if (n >= 1024) return '%.1f KB'.format(n / 1024);
	return '%d B'.format(n);
}

function fmtEta(s) {
	s = parseInt(s, 10);
	if (isNaN(s) || s <= 0) return '';
	if (s >= 3600) return '%dh %dm'.format(Math.floor(s / 3600), Math.floor(s % 3600 / 60));
	if (s >= 60) return '%dm %ds'.format(Math.floor(s / 60), s % 60);
	return '%ds'.format(s);
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
			this.proxySection(status),
			this.settingsSection(),
			this.ignoredSection(status)
		]);

		if (IN_PROGRESS.indexOf(job.STATE) !== -1)
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
				E('p', {}, _('Size: %s').format(fmtBytes(job.TOTAL))),
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

		if (IN_PROGRESS.indexOf(job.STATE) !== -1)
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

	/* Progress block. Element ids are stable so the poller can update text and
	   the bar width in place instead of reloading the page. */
	progressBlock: function(job) {
		if (!job.STATE || job.STATE === 'IDLE')
			return E('div', { 'id': 'ou-progress' });

		var pct = parseInt(job.PERCENT, 10);
		if (isNaN(pct)) pct = 0;

		var stage = stageLabel(job.STATE);
		var detail = this.progressDetail(job);

		return E('div', { 'class': 'cbi-section', 'id': 'ou-progress' }, [
			E('h3', {}, _('Status')),
			E('p', { 'id': 'ou-progress-stage' }, stage),
			E('div', {
				'style': 'height:14px;background:#e5e5e5;border-radius:3px;overflow:hidden;margin:6px 0'
			}, [
				E('div', {
					'id': 'ou-progress-bar',
					'style': 'height:100%;width:%d%%;background:#3d8bcd;transition:width .3s'.format(
						(job.STATE === 'VERIFIED' || job.STATE === 'APPLYING') ? 100 : pct)
				})
			]),
			E('p', { 'id': 'ou-progress-detail' }, detail),
			E('p', { 'id': 'ou-progress-msg' }, job.MESSAGE || ''),
			job.TAG ? E('p', {}, _('Release: %s').format(job.TAG)) : E('span'),
			(job.REASON && job.STATE === 'ERROR')
				? E('p', {}, _('Reason: %s').format(job.REASON))
				: E('span')
		]);
	},

	progressDetail: function(job) {
		if (job.STATE === 'DOWNLOADING') {
			var pct = parseInt(job.PERCENT, 10);
			var parts = [];
			if (!isNaN(pct)) parts.push('%d%%'.format(pct));
			if (job.TOTAL && parseInt(job.TOTAL, 10) > 0)
				parts.push('%s / %s'.format(fmtBytes(job.BYTES), fmtBytes(job.TOTAL)));
			else
				parts.push(fmtBytes(job.BYTES));
			if (parseInt(job.SPEED, 10) > 0)
				parts.push('%s/s'.format(fmtBytes(job.SPEED)));
			var eta = fmtEta(job.ETA);
			if (eta) parts.push(_('%s left').format(eta));
			return parts.join(' · ');
		}
		if (job.STATE === 'VERIFYING')
			return _('Reading %s back and comparing against the release manifest.').format(fmtBytes(job.BYTES));
		if (job.STATE === 'VERIFIED')
			return _('Size: %s').format(fmtBytes(job.TOTAL || job.BYTES));
		return '';
	},

	/* Keep the page live while a worker is running, then reload once so the
	   action block reflects the new state. */
	startPolling: function() {
		var view = this;

		this._pollFn = function() {
			return run('jobstatus').then(function(res) {
				var job = kv(res);

				if (IN_PROGRESS.indexOf(job.STATE) === -1) {
					poll.remove(view._pollFn);
					window.location.reload();
					return;
				}

				var stage = document.getElementById('ou-progress-stage');
				var bar = document.getElementById('ou-progress-bar');
				var det = document.getElementById('ou-progress-detail');
				var msg = document.getElementById('ou-progress-msg');

				if (stage) stage.textContent = stageLabel(job.STATE);

				if (bar) {
					var pct = parseInt(job.PERCENT, 10);
					if (isNaN(pct)) pct = 0;
					bar.style.width = ((job.STATE === 'VERIFYING')
						? 100 : pct) + '%';
				}
				if (det) det.textContent = view.progressDetail(job);
				if (msg) msg.textContent = job.MESSAGE || '';
			}).catch(function() { /* transient rpc error: keep polling */ });
		};

		poll.add(L.bind(this._pollFn, this), 1);
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
						return run('start').then(function(res) {
							var out = (res && res.stdout) || '';
							var err = (res && res.stderr) || '';

							/* Fail loudly. The old code reloaded
							   unconditionally, so a refused verb looked
							   exactly like a successful start. */
							if (out.indexOf('RESULT=started') === -1) {
								ui.addNotification(null, E('p', {},
									_('The download could not be started: %s').format(err || out || _('unknown error'))),
									'danger');
								return;
							}
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
	},

	/* Download proxy selector.
	   Built as plain DOM rather than a form.Map so the preset can write into
	   the custom field on change without relying on internal form APIs. */
	proxySection: function(status) {
		var view = this;
		var preset = status.PROXY_PRESET || 'direct';
		var custom = status.GITHUB_PROXY || '';
		var effective = status.PROXY_EFFECTIVE || '';

		var sel = E('select', { 'class': 'cbi-input-select', 'id': 'ou-proxy-preset' }, [
			E('option', { 'value': 'direct', 'selected': preset === 'direct' ? 'selected' : null }, _('Direct (no proxy)')),
			E('option', { 'value': 'gh-proxy', 'selected': preset === 'gh-proxy' ? 'selected' : null }, 'gh-proxy.com'),
			E('option', { 'value': 'ghfast', 'selected': preset === 'ghfast' ? 'selected' : null }, 'ghfast.top'),
			E('option', { 'value': 'hk-gh-proxy', 'selected': preset === 'hk-gh-proxy' ? 'selected' : null }, _('hk.gh-proxy.com (often slow)')),
			E('option', { 'value': 'custom', 'selected': preset === 'custom' ? 'selected' : null }, _('Custom'))
		]);

		var input = E('input', {
			'class': 'cbi-input-text',
			'id': 'ou-proxy-custom',
			'type': 'text',
			'value': custom,
			'placeholder': 'https://example.com/',
			'style': 'width:100%'
		});

		sel.addEventListener('change', function() {
			var p = PROXY_PRESETS[sel.value];
			if (p === null) { input.focus(); return; }
			input.value = p;
		});

		var save = E('button', {
			'class': 'cbi-button cbi-button-apply',
			'click': function(ev) {
				ev.preventDefault();
				var p = sel.value;
				var v = (p === 'custom') ? input.value.trim() : (PROXY_PRESETS[p] || '');

				uci.set('online-update', 'main', 'proxy_preset', p);
				uci.set('online-update', 'main', 'github_proxy', v);
				uci.save();
				return uci.apply().then(function() {
					ui.addNotification(null, E('p', {},
						_('Proxy saved. It applies to the next download only; verification still uses the release manifest.')),
						'info');
					window.location.reload();
				});
			}
		}, _('Save proxy'));

		return E('div', { 'class': 'cbi-section' }, [
			E('h3', {}, _('Download proxy')),
			E('div', { 'class': 'cbi-map-descr' },
				_('A proxy only changes where the file is fetched from. The SHA256 check is always performed against the release manifest, so a proxy that alters the file will be detected and the download discarded.')),

			E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title' }, _('Channel')),
				E('div', { 'class': 'cbi-value-field' }, sel)
			]),
			E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title' }, _('Custom prefix')),
				E('div', { 'class': 'cbi-value-field' }, [
					input,
					E('div', { 'class': 'cbi-value-description' },
						_('Used only when the channel is "Custom". Leave empty for a direct connection. Must start with https:// and end with a slash.'))
				])
			]),
			E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title' }, _('Effective prefix')),
				E('div', { 'class': 'cbi-value-field' },
					effective ? E('code', {}, effective) : E('em', {}, _('none (direct)')))
			]),
			E('div', {}, [ save ])
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
	}
});
