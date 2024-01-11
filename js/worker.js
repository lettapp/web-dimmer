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

class Messenger
{
	constructor(waitLoad)
	{
		this.waitLoad = waitLoad || Promise.resolve();

		chrome.runtime.onMessage.addListener(
			this.onMessage.bind(this)
		);
	}

	async sendMessage(message, tabId)
	{
		const callback = this.onCallback.bind(this);

		if (tabId) {
			return chrome.tabs.sendMessage(tabId, message).catch(e => null);
		}

		try {
			return chrome.runtime.sendMessage(message).then(callback).catch(e => null);
		}
		catch (e) {
			this.onContextInvalidated?.();
		}
	}

	onMessage(message, sender, callback)
	{
		let [kind, data] = Object.entries(message).pop();

		kind = string.on(kind);

		if (kind in this)
		{
			this.waitLoad.then(
				_ => this[kind](data, sender.tab, callback)
			);

			return true;
		}
	}

	onCallback(response)
	{
		return this.waitLoad.then(_ => response);
	}
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

class tabs
{
	static execContentScript()
	{
		const files = chrome.runtime.getManifest().content_scripts[0].js;

		this.query({}, tabs =>
		{
			for (const tab of tabs)
			{
				if (!this.isScriptable(tab.url)) {
					continue;
				}

				chrome.scripting.executeScript({
					target: {
						tabId: tab.id
					},
					files: files
				});
			}
		});
	}

	static getActive(callback)
	{
		this.query({active:true, currentWindow:true},
			tabs => callback(tabs[0])
		);
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

		if (url)
		{
			if (url.protocol == 'file:') {
				return string.last('/', url.pathname);
			}

			return url.host;
		}
	}

	static query(p, callback)
	{
		chrome.tabs.query(p).then(callback);
	}
}

class App extends Messenger
{
	constructor()
	{
		super();

		self.addEventListener('install',
			this.onInstalled.bind(this)
		);

		chrome.commands.onCommand.addListener(
			this.onCommand.bind(this)
		);

		chrome.runtime.onStartup.addListener(
			this.onStartup.bind(this)
		);
	}

	onInstalled()
	{
		sync.init(
			_ => tabs.execContentScript()
		);
	}

	onStartup()
	{
		sync.cleanAuto();
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
		const chg = MAX_STEP * sign;

		sync.load(host, (level, local, auto) =>
		{
			if (auto)
			{
				if (sign != 1) {
					return;
				}

				sync.unsetAuto(host);

				this.sendMessage({autoModeDisabled:host});
			}
			else {
				level = Float(
					math.bound(level + chg, MIN_LEVEL, MAX_LEVEL)
				);

				sync.set(level, local, host);

				this.sendMessage({levelDidChange:level});
			}
		});
	}
}

let app = new App;