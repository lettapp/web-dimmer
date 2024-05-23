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

	static last(after, str)
	{
		return str.split(after).pop();
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

	static bound(n, min, max)
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

	static contextInvalidated(isUncaught)
	{
		this.send({contextInvalidated:isUncaught});

		this.channels = {};
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

		if (url)
		{
			if (url.protocol == 'file:') {
				return string.last('/', url.pathname);
			}

			return url.host;
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
				throw 'missing protoid for child';
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
			if (k in a) {
				a[k] = a[k].concat(' ', b[k]);
			}
			else {
				a[k] = b[k];
			}
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

		if (action in this && this != sender)
		{
			return this[action](sender, data);
		}

		if (nextResponder = this.parent || this.superview)
		{
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

	viewDidSet()
	{
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

	addClass(str)
	{
		this.element.classList.add(...str.split(' '));
	}

	delClass(str)
	{
		this.element.classList.remove(...str.split(' '));
	}

	import(methods)
	{
		methods = methods.split(' ');

		for (const x of methods)
		{
			if (x in this) {
				throw Error('property already defined');
			}

			if (this.element[x] instanceof Function)
			{
				this[x] = this.element[x].bind(this.element);
			}
			else {
				Object.defineProperty(this, x,
				{
					get() {
						return this.element[x];
					},
					set(v) {
						this.element[x] = v;
					}
				});
			}
		}
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
		for (const view of views)
		{
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

		for (const event of events.split(' '))
		{
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
			for (const [target, action] of targets)
			{
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
		if (e.which != 1) {
			return;
		}

		this.pressedPid = setTimeout(_ => {
			this.invokedPid = setInterval(_ => this.didInvoke(), 20);
		}, 450);

		window.onpointerup = _ =>
		{
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
	constructor(init )
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
			return this.finalValue;
		}

		return this.value;
	}

	setValue(value, animate)
	{
		if (animate) {
			return this.finalValue = this.animate(value);
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

	animate(val)
	{
		const chg = Math.sign(val - this.value) * this.step;

		if (this.animId) {
			this.animateEnd();
		}

		this.animId = setInterval(
			_ => math.floatEq(this.value += chg, val) && this.animateEnd(), 17
		);

		return math.float(val);
	}

	animateEnd()
	{
		this.animId = clearInterval(this.animId);
	}

	setBackground()
	{
		const w = (this.value - this.min) / (this.max - this.min) * 100;

		const a = '--cs-slider-filled-color';
		const b = '--cs-slider-remain-color';

		this.style.background = string.format(
			'linear-gradient(to right, var(%s) 0%, var(%s) %s%, var(%s) %s%, var(%s) 100%)', [a, a, w, b, w, b]
		);
	}
}

class UISwitch extends UISlider
{
	constructor(init )
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

		if (host) {
			this.addChild(
				new AdjustView(host)
			);
		}
		else {
			this.addChild(new AboutView);
		}
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
		view.queryId('buttons').addEventListener('click', this.buttonClicked);
	}

	buttonClicked(e)
	{
		const urls = {
			testdrive:'https://lett.app/web-dimmer/playground',
			shortcuts:'chrome://extensions/shortcuts',
		};

		chrome.tabs.create({
			url:urls[e.target.id]
		});
	}
}

class AdjustView extends ViewController
{
	constructor(host)
	{
		super(
			new UIView('UIAdjustView')
		);

		this.init(host);

		notifications.addListener(this, 'levelDidChange autoModeDisabled');
	}

	init(host, animate)
	{
		sync.load(host, (level, local, auto) =>
		{
			this.host = host;
			this.auto = auto;
			this.local = auto || local;

			if (auto) {
				this.set(0);
			}
			else {
				this.set(level, animate);
			}
		});
	}

	set(level, animate)
	{
		this.localLevel = this.level;

		this.onModeChange();

		this.setLevel(level, animate);
	}

	localSwitchClicked(sender)
	{
		const {localLevel, host, auto} = this;

		if (sender.isOn)
		{
			this.set(localLevel, true);

			sync.set(localLevel, true, host);
		}
		else {
			sync.getGlobal(
				level => this.set(level, true)
			);

			if (auto) {
				this.disableAutoMode();
			}
			else {
				sync.unset(host);
			}
		}
	}

	adjustButtonClicked(sender)
	{
		this.setLevel(this.level + sender.value);

		this.onLevelChange();
	}

	adjustSliderMoved(sender)
	{
		this.onLevelChange();
	}

	onLevelChange()
	{
		if (this.auto) {
			this.disableAutoMode();
		}

		sync.set(this.level, this.local, this.host);
	}

	onModeChange()
	{
		let {local, auto, host} = this;

		if (local)
		{
			if (auto) {
				host = string.format('Auto-Disabled: %s', this.autoReason);
			}
			else {
				host = host.replace('www.', '');
			}
		}
		else {
			host = 'Global';
		}

		this.domain.textContent = host;
	}

	disableAutoMode()
	{
		this.auto = false;

		this.onModeChange();

		sync.unsetAuto(this.host);
	}

	setLevel(value, animate)
	{
		this.slider.setValue(value, animate);
	}

	get level()
	{
		return this.slider.getValue();
	}

	get local()
	{
		return this.switch.isOn;
	}

	set local(bool)
	{
		this.switch.isOn = bool;
	}

	get autoReason()
	{
		switch (this.auto)
		{
			case AUTO_IMG: return 'Image';
			case AUTO_RGB: return 'Dark Site';
		}
	}

	onLevelDidChange(newval)
	{
		this.setLevel(newval);
	}

	onAutoModeDisabled(host)
	{
		this.init(host, true);
	}

	viewDidSet(view)
	{
		const localSwitch = new UISwitch({
			isOn:false,
			target:[this, 'onChange:localSwitchClicked'],
		});

		const adjustUp = new UIStepper({
			css:'CSAdjustButton',
			image:'UIIconPlus',
			target:[this, 'onInvoke:adjustButtonClicked'],
			value:+MAX_STEP,
		});

		const adjustDown = new UIStepper({
			css:'CSAdjustButton',
			image:'UIIconMinus',
			target:[this, 'onInvoke:adjustButtonClicked'],
			value:-MAX_STEP,
		});

		const adjustSlider = new UISlider({
			css:'CSAdjustSlider CSFlexItem',
			range:Range(MIN_LEVEL, MAX_LEVEL, MIN_STEP, MIN_LEVEL),
			target:[this, 'onChange:adjustSliderMoved'],
		});

		view.addSubview(localSwitch, 'localSwitch');
		view.addSubviews([adjustDown, adjustSlider, adjustUp], 'controls');

		this.slider = adjustSlider;
		this.switch = localSwitch;
		this.domain = view.queryId('domain');
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