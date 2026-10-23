'use strict';
'require baseclass';
'require rpc';
'require uci';
'require dom';
'require ui';

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
	txt.split('\n').forEach(function(l) {
		var i = l.indexOf('=');
		if (i > 0) out[l.substring(0, i)] = l.substring(i + 1);
	});
	return out;
}

return baseclass.extend({
	title: _('Firmware update'),

	load: function() {
		return Promise.all([
			uci.load('online-update'),
			run('check')
		]);
	},

	render: function(data) {
		var st = kv(data[1]);

		// Stay silent on errors, "up to date", and ignored versions: the
		// overview page must not turn into a nag screen.
		if (st.UPDATE_AVAILABLE !== '1')
			return E([]);

		var cur = st.CURRENT || '?';
		var lat = st.LATEST || '?';

		return E('div', { 'class': 'cbi-section', 'style': 'border-left:4px solid #e67e22;padding:8px 12px' }, [
			E('strong', {}, _('New firmware available: %s').format(lat)),
			E('div', {}, _('Current version: %s').format(cur)),
			E('div', { 'style': 'margin-top:8px' }, [
				E('button', {
					'class': 'cbi-button cbi-button-action important',
					'click': ui.createHandlerFn(this, 'goUpdate')
				}, _('Update online')),
				' ',
				E('button', {
					'class': 'cbi-button',
					'click': function(ev) {
						ev.preventDefault();
						if (st.NOTES_URL) window.open(st.NOTES_URL, '_blank');
					}
				}, _('Download manually')),
				' ',
				E('button', {
					'class': 'cbi-button',
					'click': ui.createHandlerFn(this, 'doIgnore', lat)
				}, _('Do not remind me'))
			])
		]);
	},

	goUpdate: function(ev) {
		ev.preventDefault();
		window.location.href = L.url('admin/system/online-update');
	},

	doIgnore: function(ev, tag) {
		ev.preventDefault();
		return run('ignore', [ tag ]).then(function() {
			window.location.reload();
		});
	}
});
