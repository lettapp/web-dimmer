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

function match(expr, ...cases)
{
	for (const [k, v] of cases) {
		if (expr === k) return v;
	}
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
	static bound(n, [min, max])
	{
		return n < min ? min : n > max ? max : n;
	}
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
			_ => this.set(obj)
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

class tabs
{
	static execContentScript()
	{
		const files = chrome.runtime.getManifest().content_scripts[0];

		this.getAccessible().then(tabs =>
		{
			for (const tab of tabs)
			{
				chrome.scripting.executeScript({
					target: {
						tabId: tab.id
					},
					files: files.js
				});
			}
		});
	}

	static getActive()
	{
		return this.query({active:true, currentWindow:true}).then(tabs => tabs[0]);
	}

	static host(tab)
	{
		const url = this.isScriptable(tab);

		if (url) {
			return url.host || url.pathname.split('/').pop();
		}
	}

	static getAccessible()
	{
		return this.query({}).then(
			tabs => tabs.filter(tab => this.isScriptable(tab))
		);
	}

	static isScriptable(tab)
	{
		const url = new URL(tab.url || 'chrome://newtab');

		const unscriptable = [
			'chromewebstore.google.com',
			'microsoftedge.microsoft.com',
		];

		if (url.protocol != 'chrome:' && !unscriptable.includes(url.host)) {
			return url;
		}
	}

	static query(p)
	{
		return chrome.tabs.query(p);
	}
}

class Main
{
	constructor(waitLoad)
	{
		this.waitLoad = waitLoad || Promise.resolve();

		this.waitLoad.then(
			this.onReady.bind(this)
		);

		this.register({
			onStartup: chrome.runtime.onStartup,
			onMessage: chrome.runtime.onMessage,
			onCommand: chrome.commands.onCommand,
			onInstall: {
				addListener: addEventListener.bind(null, 'install')
			}
		});
	}

	onReady() {
	}

	onMessage(message, sender, callback)
	{
		const [kind, data] = unpack(message);

		this[on(kind)]?.(
			data, sender.tab, callback
		);
	}

	sendMessage(message, tabId)
	{
		if (tabId) {
			return chrome.tabs.sendMessage(tabId, message).catch(none);
		}

		return chrome.runtime.sendMessage(message).catch(none);
	}

	register(events)
	{
		const waitLoad = function(event, ...args)
		{
			this.waitLoad.then(
				_ => this[event](...args)
			);

			return true;
		}

		for (const event in events)
		{
			if (event in this)
			{
				events[event].addListener(
					waitLoad.bind(this, event)
				);
			}
		}
	}
}

class App extends Main
{
	onStartup()
	{
		this.cleanup();
	}

	onInstall()
	{
		this.upgrade().then(
			_ => tabs.execContentScript()
		);
	}

	onCommand(command, tab)
	{
		const host = tabs.host(tab);

		if (host) switch (command)
		{
			case 'increase':
				return this.adjust(host, +1);

			case 'decrease':
				return this.adjust(host, -1);
		}
	}

	adjust(host, sign)
	{
		sync.load(host).then(({auto, level}) =>
		{
			level = math.bound(level + sign * Level.MaxStep, [Level.Min, Level.Max]);

			if (auto > Auto.Usr) {
				return sync.remove(host);
			}

			sync.set(host, auto, level);
		});
	}

	async cleanup()
	{
		const o = await storage.get();

		for (const k in o) {
			!k.startsWith('_') && (o[k].auto != Auto.Usr) && delete o[k];
		}

		storage.rewrite(o);
	}

	async upgrade()
	{
		const v = await storage.get(Ext.V);

		const oldVer = v?.replace(/\./g, '');
		const newVer = chrome.runtime.getManifest().version;

		if (!oldVer) {
			return storage.rewrite({
				[Ext.V]:newVer,
				[Ext.G]:{auto:0, level:.14}
			});
		}
	}
}

let app = new App;