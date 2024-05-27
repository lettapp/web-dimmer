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
		return this.query({active:true}).then(tabs => tabs[0]);
	}

	static isScriptable(url = 'chrome://newtab')
	{
		url = new URL(url);

		if (url.protocol != 'chrome:' && url.host != 'chromewebstore.google.com') {
			return url;
		}
	}

	static host(url)
	{
		url = this.isScriptable(url);

		if (url) {
			return url.protocol == 'file:' ? url.pathname.split('/').pop() : url.host;
		}
	}

	static getAccessible()
	{
		return this.query({}).then(
			tabs => tabs.filter(tab => this.isScriptable(tab.url))
		);
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
		sync.cleanAuto();
	}

	onInstall()
	{
		sync.init(
			_ => tabs.execContentScript()
		);
	}

	onCommand(command, tab)
	{
		const host = tabs.host(tab.url);

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
		sync.load(host, (level, local, auto) =>
		{
			level = math.float(level + MAX_STEP * sign);
			level = math.bound(level, [MIN_LEVEL, MAX_LEVEL]);

			if (auto && sign < 0) {
				return;
			}

			if (auto) {
				sync.unsetAuto(host);

				this.sendMessage({autoModeDisabled:host});
			}
			else {
				sync.set(level, local, host);

				this.sendMessage({levelDidChange:level});
			}
		});
	}
}

let app = new App;