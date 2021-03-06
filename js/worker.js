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

class tabs
{
	static getActive(fn)
	{
		chrome.tabs.query(
			{active:true, currentWindow:true}, tabs => fn(tabs[0])
		);
	}

	static execContentScript()
	{
		chrome.tabs.query({}, tabs =>
		{
			const files = chrome.runtime.getManifest().content_scripts[0].js;

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

	static isScriptable(url = 'chrome://newtab')
	{
		url = new URL(url);

		if (url.protocol != 'chrome:' && !url.href.includes('chrome.google.com/webstore'))
		{
			return url;
		}
	}

	static host(url)
	{
		url = this.isScriptable(url);

		if (url)
		{
			if (url.protocol == 'file:')
			{
				return string.last('/', url.pathname);
			}

			return url.host;
		}
	}
}

class Main
{
	constructor()
	{
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

				FrameMessage('autoModeDisabled', host);
			}
			else {
				level = Float(
					std.clamp(level + chg, MIN_LEVEL, MAX_LEVEL)
				);

				sync.set(level, local, host);

				FrameMessage('levelDidChange', level);
			}
		});
	}
}

new Main;