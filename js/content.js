/*
 * This code is part of Lett Web Dimmer chrome extension
 *
 * LettApp lett.app/web-dimmer
 * GitHub  @lettapp
 */
'use strict';

const MIN_LEVEL	= 0.00;
const MAX_LEVEL	= 0.67;
const MIN_STEP	= 0.01;
const MAX_STEP	= 0.02;
const AUTO_DIS	= 0;
const AUTO_IMG	= 1;
const AUTO_RGB	= 2;
const AUTO_NON	= null;

function none()
{
	return null;
}

function keys(object)
{
	return Object.keys(object);
}

function values(object)
{
	return Object.values(object);
}

function entries(object)
{
	return Object.entries(object);
}

function unpack(object)
{
	return entries(object).shift();
}

function assign()
{
	return Object.assign(...arguments);
}

function on(s)
{
	return 'on' + s[0].toUpperCase() + s.slice(1);
}

function Range(min, max, step, value)
{
	return {min, max, step, value};
}

class is
{
	static null(x)
	{
		return x == null;
	}

	static string(x)
	{
		return this.type(x) == String;
	}

	static type(x)
	{
		return x?.constructor;
	}
}

class string
{
	static split(str, d = ' ')
	{
		return str ? str.split(d) : [];
	}

	static match(ptrn, str)
	{
		return str.match(ptrn) || [];
	}

	static format(str, args)
	{
		args = array.cast(args);

		return str.replace(/%s/g, _ => args.shift());
	}
}

class array
{
	static cast(x)
	{
		return x instanceof Array ? x : [x];
	}
}

class math
{
	static float(float, p = 2)
	{
		return +(float).toFixed(p);
	}

	static floatEq(a, b)
	{
		return Math.abs(a - b) < 1e-9;
	}

	static bound(n, [min, max])
	{
		return n < min ? min : n > max ? max : n;
	}
}

class notifications
{
	static addListener(target, ids)
	{
		ids = string.split(ids);

		for (const id of ids) {
			this.getChannel(id).add(target);
		}
	}

	static removeListener(target, ids)
	{
		ids = string.split(ids);

		if (!ids.length) {
			ids = keys(this.channels);
		}

		for (const id of ids) {
			this.getChannel(id).delete(target);
		}
	}

	static send(pack)
	{
		const [id, data] = unpack(pack);

		for (const target of this.getChannel(id)) {
			target[on(id)](data);
		}
	}

	static getChannel(id)
	{
		return this.channels[id] ||= new Set;
	}

	static channels = {};
}

class storage
{
	static get(key, initVal)
	{
		return this.local.get(key).then(
			r => is.string(key) ? (r[key] ?? initVal) : r
		);
	}

	static set(key, val)
	{
		if (is.string(key)) {
			key = {[key]:val};
		}

		return this.local.set(key);
	}

	static remove(key)
	{
		return this.local.remove(key);
	}

	static clear()
	{
		return this.local.clear();
	}

	static local = chrome.storage.local;
}

class sync
{
	static load(host, callback)
	{
		return storage.get([host, 'g', 'auto']).then(d =>
		{
			let a = d.g,
				b = host in d,
				c = d.auto[host] ?? AUTO_NON;

			if (b) {
				a = d[host];
			}

			return callback(a, b, c);
		});
	}

	static get(host)
	{
		return storage.get(host, 0);
	}

	static set(level, local, host)
	{
		if (!local) {
			host = 'g';
		}

		storage.set(host, level);
	}

	static unset(host)
	{
		storage.remove(host);
	}

	static getGlobal(fn)
	{
		return storage.get('g').then(fn);
	}

	static setAuto(host, mode)
	{
		storage.get('auto').then(auto =>
		{
			if (mode == AUTO_NON && auto[host] == AUTO_RGB) {
				auto[host] = AUTO_DIS;
			}
			else {
				auto[host] = mode;
			}

			storage.set({auto});
		});
	}

	static unsetAuto(host)
	{
		this.setAuto(host, AUTO_NON);
	}

	static cleanAuto()
	{
		storage.get().then(d =>
		{
			const auto = d.auto;

			for (const host in auto)
			{
				if (host in d || auto[host] != AUTO_DIS) {
					delete auto[host];
				}
			}

			storage.set(d);
		});
	}

	static init(fn)
	{
		const a = {
			auto:{}, g:0.14
		};

		storage.get().then(b =>
		{
			for (const k in a) {
				if (k in b) delete a[k];
			}

			storage.set(a).then(fn);
		});
	}
}

class Layer
{
	constructor()
	{
		const el = document.createElement('web-dimmer');

		assign(el.style, {
			position:'fixed',
			inset:0,
			opacity:0,
			zIndex:2147483647,
			backgroundColor:'#000',
			pointerEvents:'none',
		});

		this.append(
			this.el = el
		);

		this.interv = 0;
	}

	adjust(level, animate)
	{
		const el = this.el.style;

		if (animate)
		{
			el.transition = 'opacity 200ms';

			setTimeout(
				_ => el.transition = '', 200
			);
		}

		el.opacity = level;
	}

	onMutation()
	{
		if (this.el == document.documentElement.lastElementChild) {
			return;
		}

		if (!chrome.runtime?.id) {
			return this.remove();
		}

		if (this.interv++ < 5) {
			return this.append();
		}
	}

	append(initial)
	{
		document.documentElement.appendChild(this.el);

		if (initial) {
			notifications.addListener(this, 'mutation');
		}
	}

	remove()
	{
		notifications.removeListener(this, 'mutation');

		this.el.remove();
	}
}

class App
{
	constructor()
	{
		if (document.documentElement.nodeName != 'HTML') {
			return;
		}

		[this.host, this.path] = this.getHostPath();

		this.layer = new Layer;

		this.load = this.init();

		chrome.storage.onChanged.addListener(
			this.onChange.bind(this)
		);

		this.observeMutations();
	}

	init(reinit)
	{
		return sync.load(this.host, (level, local, auto) =>
		{
			assign(this, {local, auto});

			if (local || reinit) {
				return this.adjust(level, reinit);
			}

			switch (auto)
			{
				case AUTO_NON:
					return this.adjust(level) | 1;

				case AUTO_DIS:
					return this.adjust(level);

				default:
					return this.adjust(0);
			}
		});
	}

	onMutation()
	{
		if (document.body)
		{
			const reason = this.getAutoMode();

			this.load.then(
				detect => detect && reason && this.autoDisable(reason)
			);

			notifications.removeListener(this, 'mutation');
		}
	}

	onChange(d)
	{
		let c, host = this.host;

		if (c = d.g)
		{
			if (this.local || this.auto) {
				return;
			}

			return this.adjust(c.newValue);
		}

		if (c = d[host])
		{
			const modeChange = [c.oldValue, c.newValue].some(is.null);

			if (modeChange) {
				return this.init(true);
			}

			return this.adjust(c.newValue);
		}

		if (c = d.auto)
		{
			const autoRevoked = c.oldValue[host] && !c.newValue[host];

			if (autoRevoked) {
				return this.init(true);
			}
		}
	}

	autoDisable(reason, animate)
	{
		this.adjust(0, animate);

		sync.setAuto(this.host, this.auto = reason);
	}

	adjust(level, animate)
	{
		this.layer.adjust(level, animate);
	}

	getAutoMode()
	{
		if (this.isDoc) {
			return AUTO_NON;
		}

		if (this.isMedia) {
			return AUTO_IMG;
		}

		if (this.hexTest) {
			return AUTO_RGB;
		}

		setTimeout(
			_ => this.auto != AUTO_DIS && this.hexTest && this.autoDisable(AUTO_RGB, true),
		1e3);
	}

	observeMutations()
	{
		const observer = new MutationObserver(
			mutation => notifications.send({mutation})
		);

		observer.observe(
			document.documentElement, {childList:true}
		);

		notifications.addListener(this, 'mutation');
	}

	getHostPath()
	{
		const host = location.host;
		const path = location.pathname.split('/').pop();
		const http = location.protocol;

		return (http == 'file:') ? [path, path] : [host, path];
	}

	get isMedia()
	{
		return /^(image|video)/.test(document.contentType);
	}

	get isDoc()
	{
		return /(pdf|doc|docx)$/.test(this.path);
	}

	get hexTest()
	{
		const hex = [document.documentElement, document.body].map(node =>
		{
			let rgb = string.match(/\d+/g, getComputedStyle(node).backgroundColor).map(Number);

			if (rgb.length != 3) {
				rgb = [255, 255, 255];
			}

			return +rgb.reduce(
				(p, c) => p + c.toString(16).padStart(2, 0), '0x'
			);
		});

		return Math.min(...hex) < 0xbbbbbb;
	}
}

let app = new App;