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
			return url.host || url.pathname.split('/').pop();
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

class UIFactory
{
	constructor()
	{
		this.protos = {};

		for (const proto of document.body.firstChild.children)
		{
			const id = proto.getAttribute('protoid');

			if (id) {
				proto.removeAttribute('protoid');
			}
			else {
				throw proto;
			}

			this.protos[id] = proto;
		}

		document.body.innerHTML = '';
	}

	create(id)
	{
		return this.protos[id].cloneNode(true);
	}

	extend(a, b)
	{
		for (const k in b)
		{
			let ak = a[k], bk = b[k];

			switch (is.type(ak))
			{
				case String:
					bk = ak.concat(' ', bk);
				break;

				case Array:
					bk = ak.concat(bk);
				break;

				case Object:
					bk = this.extend(ak, bk);
				break;
			}

			a[k] = bk;
		}

		return a;
	}
}

class UIResponder
{
	setParent(viewController)
	{
		this.parent = viewController;
	}

	handleAction(action, sender, data)
	{
		let nextResponder;

		if (action in this && this != sender) {
			return this[action](sender, data);
		}

		if (nextResponder = this.parent || this.superview) {
			return nextResponder.handleAction(action, sender, data);
		}
	}
}

class ViewController extends UIResponder
{
	constructor(view, viewDelegate)
	{
		super();

		this.view;
		this.model;
		this.children = [];

		this.setView(view, viewDelegate);
	}

	setView(view, viewDelegate)
	{
		view.setParent(this);

		if (viewDelegate) {
			view.delegate = new viewDelegate(this);
		}

		this.viewDidSet(
			this.view = view
		);
	}

	viewDidSet() {
	}

	addChild(child, viewTargetId)
	{
		child.setParent(this);

		this.children.push(child);

		this.view.addSubview(child.view, viewTargetId);
	}
}

class UIElement extends UIResponder
{
	constructor(protoId)
	{
		super();

		this.element = UI.create(protoId);

		this.import('style hidden addEventListener setAttribute querySelector textContent');
	}

	appendChild(child)
	{
		this.element.appendChild(child.element || child);
	}

	addClass(s)
	{
		this.element.classList.add(
			...string.split(s)
		);
	}

	delClass(s)
	{
		this.element.classList.remove(
			...string.split(s)
		);
	}

	import(s)
	{
		const e = this.element, p = {};

		for (const k of string.split(s))
		{
			if (k in this) {
				throw k;
			}

			if (e[k] instanceof Function)
			{
				p[k] = {
					value: e[k].bind(e)
				};
			}
			else {
				p[k] = {
					get: f => e[k],
					set: v => e[k] = v,
				};
			}
		}

		Object.defineProperties(this, p);
	}
}

class UIView extends UIElement
{
	constructor(protoId, init = {})
	{
		super(protoId);

		this.superview;
		this.targets = {};

		this.init(init);
	}

	init(init)
	{
		if (init.import) {
			this.import(init.import);
		}

		if (init.events) {
			this.addListener(init.events);
		}

		if (init.target) {
			this.addTarget(...init.target);
		}

		if (init.css) {
			this.addClass(init.css);
		}

		if (init.text) {
			this.textContent = init.text;
		}

		if (init.attrs) {
			for (const attr in init.attrs) {
				this.setAttribute(attr, init.attrs[attr]);
			}
		}
	}

	remove()
	{
		this.element.remove();
	}

	addSubview(view, targetId)
	{
		switch (typeof targetId)
		{
			case 'string':
				return this.queryId(targetId).appendChild(view.element);

			case 'number':
				return this.element.prepend(view.element);

			default:
				return this.appendChild(view);
		}
	}

	addSubviews(views, targetId)
	{
		for (const view of views) {
			this.addSubview(view, targetId)
		}
	}

	addTarget(target, events)
	{
		events = events.split(' ');

		for (const eventAction of events)
		{
			const [event, action] = eventAction.split(':');

			this.eventTargets(event).set(target, action);
		}
	}

	addListener(events)
	{
		const handler = this.handleEvent.bind(this);

		for (const event of events.split(' ')) {
			this.addEventListener(event, handler);
		}
	}

	handleEvent(e)
	{
		e.stopPropagation();

		this[on(e.type)](e);
	}

	queryId(id)
	{
		return this.querySelector('#' + id);
	}

	sendAction(event, data)
	{
		const targets = this.eventTargets(event);

		if (targets.size)
		{
			for (const [target, action] of targets) {
				target.handleAction(action, this, data);
			}
		}
		else {
			this.superview?.handleAction(event, this, data);
		}
	}

	eventTargets(event)
	{
		return this.targets[event] ||= new Map;
	}

	onClick()
	{
		this.sendAction('onClick');
	}
}

class UIButton extends UIView
{
	constructor(init)
	{
		super('UIDefault', init);

		if (init.label) {
			this.setLabel(init.label);
		}

		if (init.image) {
			this.addImage(init.image);
		}

		this.value = init.value;
	}

	setLabel(text)
	{
		this.textContent = text;
	}

	addImage(protoId)
	{
		this.appendChild(
			UI.create(protoId)
		);
	}
}

class UIStepper extends UIButton
{
	constructor(init)
	{
		UI.extend(init, {
			events:'pointerdown'
		});

		super(init);
	}

	onPointerdown(e)
	{
		if (e.which != 1) return;

		this.pressedPid = setTimeout(_ => {
			this.invokedPid = setInterval(_ => this.didInvoke(), 20);
		}, 450);

		window.onpointerup = _ => {
			clearTimeout(this.pressedPid);
			clearInterval(this.invokedPid);
			window.onpointerup = null;
		};

		this.didInvoke();
	}

	didInvoke()
	{
		this.sendAction('onInvoke');
	}
}

class UISlider extends UIView
{
	constructor(init)
	{
		UI.extend(init, {
			import:'min max step',
			events:'input'
		});

		super('UISlider', init);

		assign(this, init.range);
	}

	onInput()
	{
		this.setBackground();
		this.sendAction('onChange');
	}

	getValue()
	{
		if (this.animId) {
			return this.xValue;
		}

		return this.value;
	}

	setValue(value, animate)
	{
		if (animate) {
			return this.xValue = this.animate(value);
		}

		this.value = value;
	}

	get value()
	{
		return +this.element.value;
	}

	set value(n)
	{
		this.element.value = n;
		this.setBackground();
	}

	animate(newVal)
	{
		const sign = Math.sign(newVal - this.value);

		if (this.animId) {
			this.animateEnd();
		}

		this.animId = setInterval(_ =>
		{
			let stepVal = this.value + (sign * this.step * 2.5);

			if (sign > 0) {
				stepVal = Math.min(stepVal, newVal);
			}
			else {
				stepVal = Math.max(stepVal, newVal);
			}

			if (stepVal == newVal) {
				this.animateEnd();
			}

			this.value = stepVal;
		}, 17);

		return newVal;
	}

	animateEnd()
	{
		this.animId = clearInterval(this.animId);
	}

	setBackground()
	{
		const w = (this.value / this.max) * 100;

		const a = '--cs-slider-filled-color';
		const b = '--cs-slider-remain-color';

		this.style.background = string.format(
			'linear-gradient(to right, var(%s) %s%, var(%s) 0)', [a, w, b]
		);
	}
}

class UISwitch extends UISlider
{
	constructor(init)
	{
		UI.extend(init, {
			css:'CSSwitch',
			range:Range(0, 1, 1, +init.isOn)
		});

		super(init);
	}

	get isOn()
	{
		return this.value == 1;
	}

	set isOn(bool)
	{
		this.value = +bool;
	}
}

class AppController extends ViewController
{
	constructor(url)
	{
		const host = tabs.host(url);

		super(
			new UIView('UIDefault')
		);

		this.addChild(
			host ? new AdjustView(host) : new AboutView
		);
	}

	viewDidSet(view)
	{
		document.body.appendChild(view.element);
	}
}

class AboutView extends ViewController
{
	constructor()
	{
		super(
			new UIView('UIAboutView')
		);
	}

	viewDidSet(view)
	{
		const urls = {
			testdrive:'https://lett.app/web-dimmer/playground',
			shortcuts:'chrome://extensions/shortcuts',
		};

		document.head.appendChild(
			assign(document.createElement('link'), {
				rel:'prefetch', as:'document', href:urls.testdrive
			})
		);

		view.queryId('buttons').addEventListener('click',
			e => chrome.tabs.create({url:urls[e.target.id]})
		);
	}
}

class AdjustView extends ViewController
{
	constructor(host)
	{
		super(
			new UIView('UIAdjustView')
		);

		this.init(
			this.host = host
		);

		notifications.addListener(this, 'levelDidChange autoModeDisabled');
	}

	init(host, animate = false)
	{
		sync.load(host).then(
			({level, auto}) => (this.auto = auto) & this.set(level, animate)
		);
	}

	set(level, animate)
	{
		this.userLevel = this.level;

		this.UISetMode(this.auto);
		this.UISetLevel(level, animate);
	}

	autoSwitchClicked({isOn})
	{
		const {host, userLevel} = this;

		if (isOn) {
			this.auto = Auto.Usr;

			this.set(userLevel, Anim.Swift);
			sync.set(host, Auto.Usr, userLevel);
		}
		else {
			this.auto = Auto.Off;

			sync.getGlobal().then(
				globLevel => this.set(globLevel, Anim.Swift)
			);

			sync.remove(host);
		}
	}

	adjustButtonClicked({value})
	{
		this.onLevelChange(
			this.UISetLevel(this.level + value)
		);
	}

	onLevelChange()
	{
		const {host, auto} = this;

		if (auto > Auto.Usr) {
			this.UISetMode(this.auto = Auto.Usr);
		}

		sync.set(host, this.auto, this.level);
	}

	UISetMode(newMode)
	{
		this.switch.isOn = newMode;

		switch (newMode)
		{
			case Auto.Off:
				return this.scope.textContent = 'Global';

			case Auto.Usr:
				return this.scope.textContent = this.host.replace('www.', '');

			default:
				return this.scope.textContent = string.format('Auto-Disabled: %s', this.autoReason);
		}
	}

	UISetLevel(value, animate)
	{
		this.slider.setValue(value, animate);
	}

	get level()
	{
		return this.slider.getValue();
	}

	get autoReason()
	{
		switch (this.auto) {
			case Auto.Img: return 'Image';
			case Auto.Hex: return 'Dark Site';
		}
	}

	onLevelDidChange(newVal)
	{
		this.UISetLevel(newVal);
	}

	onAutoModeDisabled(host)
	{
		this.init(host, Anim.Swift);
	}

	viewDidSet(view)
	{
		const localSwitch = new UISwitch({
			isOn:false,
			target:[this, 'onChange:autoSwitchClicked'],
		});

		const adjustUp = new UIStepper({
			css:'CSAdjustButton',
			image:'UIIconPlus',
			target:[this, 'onInvoke:adjustButtonClicked'],
			value:+Level.MaxStep,
		});

		const adjustDown = new UIStepper({
			css:'CSAdjustButton',
			image:'UIIconMinus',
			target:[this, 'onInvoke:adjustButtonClicked'],
			value:-Level.MaxStep,
		});

		const adjustSlider = new UISlider({
			css:'CSAdjustSlider',
			range:Range(Level.Min, Level.Max, Level.Step, Level.Min),
			target:[this, 'onChange:onLevelChange'],
		});

		view.addSubview(localSwitch, 'localSwitch');
		view.addSubviews([adjustDown, adjustSlider, adjustUp], 'controls');

		this.slider = adjustSlider;
		this.switch = localSwitch;
		this.scope = view.queryId('scope');
	}
}

class App extends Main
{
	constructor()
	{
		super(
			tabs.getActive()
		);

		self.UI = new UIFactory;
	}

	onReady({url})
	{
		new AppController(url);
	}

	onLevelDidChange(newVal)
	{
		notifications.send({levelDidChange:newVal});
	}

	onAutoModeDisabled(host)
	{
		notifications.send({autoModeDisabled:host});
	}
}

let app = new App;