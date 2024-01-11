/* 
 * This code is part of Lett Web Dimmer chrome extension
 * 
 */
'use strict';

const MIN_LEVEL	= 0;
const MAX_LEVEL	= 0.67;
const MIN_STEP	= 0.01;
const MAX_STEP	= 0.02;
const AUTO_NON	= null;
const AUTO_DIS	= 0;
const AUTO_IMG	= 1;
const AUTO_RGB	= 2;

function Float(float, p = 2)
{
	return +(float).toPrecision(p);
}

function FloatCmp(a, b, mode = 0)
{
	a = Float(a, 5);
	b = Float(b, 5);

	switch (mode)
	{
		case 0: return a == b;
		case 1: return a > b;
		case 2: return a < b;
	}
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

	static boolean(x)
	{
		return this.type(x) == Boolean;
	}

	static string(x)
	{
		return this.type(x) == String;
	}

	static type(x)
	{
		return x != null && x.constructor;
	}
}

class string
{
	static match(ptrn, str)
	{
		return str.match(ptrn) || [];
	}

	static format(str, args)
	{
		args = array.cast(args);

		return str.replace(/%s/g, _ => args.shift());
	}

	static last(after, str)
	{
		return str.split(after).pop();
	}

	static on(s)
	{
		return 'on' + s[0].toUpperCase() + s.slice(1);
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
	static bound(n, min, max)
	{
		return n < min ? min : n > max ? max : n;
	}
}

class notifications
{
	static addListener(target, ids)
	{
		ids = ids.split(' ');

		for (const id of ids)
		{
			this.getChannel(id).add(target);
		}
	}

	static removeListener(target, ids)
	{
		if (ids) {
			ids = ids.split(' ');
		}
		else {
			ids = Object.keys(this.channels);
		}

		for (const id of ids)
		{
			this.getChannel(id).delete(target);
		}
	}

	static send(id, data)
	{
		for (const target of this.getChannel(id))
		{
			target[string.on(id)](data);
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
		return this.ns.get(key).then(r =>
		{
			if (is.string(key)) {
				return r[key] ?? initVal;
			}

			return r;
		});
	}

	static set(key, val)
	{
		if (is.string(key)) {
			key = {[key]:val};
		}

		return this.ns.set(key);
	}

	static remove(key)
	{
		return this.ns.remove(key);
	}

	static clear()
	{
		return this.ns.clear();
	}

	static ns = chrome.storage.local;
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
			if (mode == AUTO_NON && auto[host] == AUTO_RGB)
			{
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
			for (const k in a)
			{
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

		Object.assign(el.style, {
			position:'fixed',
			top:0,
			left:0,
			right:0,
			bottom:0,
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
			notifications.addListener(this, 'Mutation');
		}
	}

	remove()
	{
		notifications.removeListener(this, 'Mutation');

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

		this.host = location.host || string.last('/', location.pathname);

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
			Object.assign(this, {local, auto});

			if (local || reinit) {
				return this.adjust(level, reinit);
			}

			switch (auto)
			{
				case AUTO_NON:
					return !this.adjust(level);

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
			const mode = this.getAutoMode();

			this.load.then(
				calc => calc && mode && this.autoDisable(mode)
			);

			notifications.removeListener(this, 'Mutation');
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

	autoDisable(mode, animate)
	{
		this.adjust(0, animate);

		sync.setAuto(this.host, this.auto = mode);
	}

	adjust(level, animate)
	{
		this.layer.adjust(level, animate);
	}

	getAutoMode()
	{
		const doctype = document.contentType;

		if (doctype == 'application/pdf') {
			return AUTO_NON;
		}

		if (doctype.startsWith('image')) {
			return AUTO_IMG;
		}

		if (this.autoHexTest()) {
			return AUTO_RGB;
		}
		else {
			setTimeout(
				_ => this.autoHexTest() && this.autoDisable(AUTO_RGB, true),
			1e3);
		}

		return AUTO_NON;
	}

	autoHexTest()
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

	observeMutations()
	{
		const observer = new MutationObserver(
			mutations => notifications.send('Mutation', mutations)
		);

		observer.observe(
			document.documentElement, {childList:true}
		);

		notifications.addListener(this, 'Mutation');
	}
}

let app = new App;