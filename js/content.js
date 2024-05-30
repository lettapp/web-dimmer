/*
 * This code is part of Lett Web Dimmer chrome extension
 *
 * LettApp lett.app/web-dimmer
 * GitHub  @lettapp
 */
'use strict';

const Level = {
	Min:0,
	Max:.67,
	Step:.01,
	MaxStep:.02,
}

const Auto = {
	Off:0,
	Usr:1,
	Img:2,
	Hex:3,
}

const Anim = {
	Easy:400,
	Swift:200,
}

const Ext = {
	V:'_ver',
	G:'_global',
}

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

	static set(obj)
	{
		return this.local.set(obj);
	}

	static remove(key)
	{
		return this.local.remove(key);
	}

	static rewrite(obj)
	{
		return this.local.clear().then(
			this.local.set(obj)
		);
	}

	static local = chrome.storage.local;
}

class sync
{
	static load(host)
	{
		return storage.get([Ext.G, host]).then(r => r[host] ?? r[Ext.G]);
	}

	static set(host, auto, level)
	{
		(auto == Auto.Off) && (host = Ext.G);

		storage.set({
			[host]:{auto, level}
		});
	}

	static remove(host)
	{
		storage.remove(host);
	}

	static getGlobal()
	{
		return storage.get(Ext.G).then(global => global.level);
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

	adjust(level, duration)
	{
		const el = this.el.style;

		if (duration)
		{
			el.transition = `opacity ${duration}ms`;

			setTimeout(
				_ => el.transition = '', duration
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

		chrome.storage.onChanged.addListener(
			this.onChange.bind(this)
		);

		this.observeMutations();

		this.host = location.host || location.pathname.split('/').pop();

		this.layer = new Layer;

		this.load = this.init();
	}

	init(anim)
	{
		return sync.load(this.host).then(
			({level, auto}) => this.adjust(level, anim) || !(this.auto = auto)
		);
	}

	onMutation()
	{
		if (!document.body) {
			return;
		}

		this.load.then(
			detect => detect && this.autoDetect()
		);

		notifications.removeListener(this, 'mutation');
	}

	onChange(chg)
	{
		let c;

		if (c = chg[Ext.G]) {
			return !this.auto && this.adjust(c.newValue.level);
		}

		if (c = chg[this.host])
		{
			const modeChange = [c.oldValue, c.newValue].some(is.null);

			if (modeChange) {
				return this.didLoad && this.init(Anim.Easy);
			}

			return this.adjust(c.newValue.level);
		}
	}

	autoDetect()
	{
		const reason = this.getAutoMode();

		if (reason) {
			this.autoDisable(reason);
		}

		if (reason === undefined) {
			setTimeout(_ => this.hexTest && this.autoDisable(Auto.Hex, Anim.Swift), 1e3);
		}
	}

	getAutoMode()
	{
		if (this.isDoc) {
			return Auto.Off;
		}

		if (this.isMedia) {
			return Auto.Img;
		}

		if (this.hexTest) {
			return Auto.Hex;
		}
	}

	autoDisable(reason, anim)
	{
		this.adjust(0, anim);

		sync.set(this.host, this.auto = reason, 0);
	}

	adjust(level, anim)
	{
		this.layer.adjust(level, anim);
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

	get didLoad()
	{
		return document.timeline.currentTime > 2e3;
	}

	get isDoc()
	{
		return document.contentType.includes('pdf');
	}

	get isMedia()
	{
		return /image|video/.test(document.contentType);
	}

	get hexTest()
	{
		const hex = [document.documentElement, document.body].map(node =>
		{
			let rgb = string.match(/\d+/g, getComputedStyle(node).backgroundColor).map(Number);

			if (rgb.length != 3) {
				rgb = [255, 255, 255];
			}

			return rgb.reduce(
				(s, n) => s + n.toString(16).padStart(2, 0), '0x'
			);
		});

		return Math.min(...hex) < 0xbbbbbb;
	}
}

let app = new App;