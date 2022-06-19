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

function RuntimeMessage(kind, data)
{
	const message = {kind, data};

	return new Promise(
		callback => chrome.runtime.sendMessage(message, callback)
	);
}

function FrameMessage(kind, data)
{
	chrome.runtime.sendMessage({kind, data},
		e => chrome.runtime.lastError
	);
}

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

class std
{
	static isNull(x)
	{
		return x == null;
	}

	static define(x, initVal)
	{
		return this.isNull(x) ? initVal : x;
	}

	static clamp(n, min, max)
	{
		return n < min ? min : n > max ? max : n;
	}
}

class array
{
	static cast(x)
	{
		return x instanceof Array ? x : [x];
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
}

class storage
{
	static get(key, initVal)
	{
		return this.namespace.get(key).then(r =>
		{
			if (typeof key == 'string')
			{
				r = std.define(r[key], initVal);
			}

			return r;
		});
	}

	static set(key, val)
	{
		if (typeof key == 'string')
		{
			key = {[key]:val};
		}

		return this.namespace.set(key);
	}

	static remove(key)
	{
		return this.namespace.remove(key);
	}

	static clear()
	{
		return this.namespace.clear();
	}

	static getAll(fn)
	{
		this.namespace.get(null).then(fn);
	}

	static namespace = chrome.storage.local;
}

class sync
{
	static load(host, fn)
	{
		storage.get([host, 'g', 'auto']).then(d =>
		{
			let a = d.g,
				b = false,
				c = std.define(d.auto[host], AUTO_NON);

			if (d[host] >= 0) {
				a = d[host];
				b = true;
			}

			fn(a, b, c);
		});
	}

	static get(host)
	{
		return storage.get(host, 0);
	}

	static set(value, local, host)
	{
		storage.set(local ? host : 'g', value);
	}

	static unset(host)
	{
		storage.remove(host);
	}

	static getGlobal(fn)
	{
		return storage.get('g').then(fn);
	}

	static setAuto(host, newVal)
	{
		storage.get('auto').then(auto =>
		{
			if (auto[host] == AUTO_RGB && newVal == AUTO_NON)
			{
				auto[host] = AUTO_DIS;
			}
			else {
				auto[host] = newVal;
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
		storage.get(null).then(d =>
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
			g:0, auto:{}
		};

		storage.getAll(b =>
		{
			for (const k in a)
			{
				if (k in b) delete a[k];
			}

			storage.set(a).then(fn);
		});
	}
}

class Notifications
{
	static addListener(target, id)
	{
		this.targets(id).add(target);
	}

	static removeListener(target, id)
	{
		this.targets(id).delete(target);
	}

	static send(id, data)
	{
		const handler = 'on' + id;

		for (const target of this.targets(id))
		{
			target[handler].call(target, data);
		}
	}

	static targets(id)
	{
		return this.events[id] ||= new Set;
	}

	static events = {};
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
				f => el.transition = '', 250
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
			Notifications.addListener(this, 'Mutation');
		}
	}

	remove()
	{
		Notifications.removeListener(this, 'Mutation');

		this.el.remove();
	}
}

class Main
{
	constructor()
	{
		if (document.documentElement.nodeName != 'HTML') {
			return;
		}

		this.observeMutations();

		this.load = new Promise(r => this.didLoad = r);

		this.host = location.host || string.last('/', location.pathname);

		this.layer = new Layer;

		this.init();

		chrome.storage.onChanged.addListener(
			this.onChange.bind(this)
		);
	}

	init(reinit)
	{
		sync.load(this.host, (level, local, auto) =>
		{
			Object.assign(this, {local, auto});

			if (local || reinit) {
				return this.adjust(level, reinit);
			}

			switch (auto)
			{
				case AUTO_NON:
					return this.autoAdjust(level);

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
				_ => mode && this.autoDisable(mode)
			);

			Notifications.removeListener(this, 'Mutation');
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
			const modeChange = [c.oldValue, c.newValue].some(std.isNull);

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

	autoAdjust(level)
	{
		this.adjust(level) & this.didLoad(true);
	}

	autoDisable(mode)
	{
		this.adjust(0);

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

		return AUTO_NON;
	}

	autoHexTest()
	{
		const hex = [document.documentElement, document.body].map(node =>
		{
			let rgb = string.match(/\d+/g, getComputedStyle(node).backgroundColor);

			if (rgb.length != 3)
			{
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
			mutations => Notifications.send('Mutation', mutations)
		);

		observer.observe(
			document.documentElement, {childList:true}
		);

		Notifications.addListener(this, 'Mutation');
	}
}

new Main;