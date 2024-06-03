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
			const id = proto.attributes.removeNamedItem('protoid').value;

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

	addChild(child, viewParentId)
	{
		child.setParent(this);

		this.children.push(child);

		this.view.addSubview(child.view, viewParentId);
	}
}

class UIElement extends UIResponder
{
	constructor(element)
	{
		super();

		this.element = element;

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
	constructor(init)
	{
		super(
			UI.create(init.source || 'UIView')
		);

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

		if (init.styles) {
			this.addClass(init.styles);
		}

		if (init.text) {
			this.textContent = init.text;
		}

		if (init.attrs) {
			for (const attr in init.attrs) {
				this.setAttribute(attr, init.attrs[attr]);
			}
		}

		if (init.superview) {
			const [view, targetId] = init.superview;
			view.addSubview(this, targetId);
		}

		this.didInit(init);
	}

	didInit(init) {
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
		super(init);

		if (init.image) {
			this.addImage(init.image);
		}

		this.value = init.value;
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

		let invoke = () => isDown && this.didInvoke() & requestAnimationFrame(invoke);
		let isDown = setTimeout(invoke, 450);

		addEventListener('pointerup',
			_ => isDown = clearTimeout(isDown), {once:true}
		);

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
			source:'UISlider',
			import:'min max step',
			events:'input'
		});

		super(init);
	}

	didInit(init)
	{
		assign(this, init.range);
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
		if (animate || this.animId) {
			return this.xValue = this.animate(value);
		}

		this.value = value;
	}

	onInput()
	{
		this.setBackground() & this.sendAction('onChange');
	}

	setBackground()
	{
		const w = (this.value / this.max) * 100;

		this.style.background = string.format(
			'linear-gradient(to right, var(--filled) %s%, var(--remain) 0)', [w]
		);
	}

	animate(newVal)
	{
		const step = Math.sign(newVal - this.value) * this.step * 1e3/400;
		const limt = step > 0 ? Math.min : Math.max;

		if (this.animId) {
			this.animateEnd();
		}

		this.animId = setInterval(_ =>
		{
			const stepVal = limt(this.value + step, newVal);

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

	get value()
	{
		return +this.element.value;
	}

	set value(n)
	{
		this.setBackground(this.element.value = n);
	}
}

class UISwitch extends UISlider
{
	constructor(init)
	{
		UI.extend(init, {
			styles:'CSSwitch',
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
			new UIView({})
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
			new UIView({source:'UIAboutView'})
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
			new UIView({source:'UIAdjustView'})
		);

		this.init(
			this.host = host
		);

		chrome.storage.onChanged.addListener(
			this.onStorageChange.bind(this)
		);
	}

	init(host, animate = false)
	{
		sync.load(host).then(
			({level, auto}) => (this.auto = auto) & this.set(level, animate)
		);
	}

	onStorageChange(chg)
	{
		let c;

		if (c = chg[Ext.G]) {
			return !this.auto && this.UISetLevel(c.newValue.level);
		}

		if (c = chg[this.host])
		{
			if (c.newValue) {
				return this.UISetLevel(c.newValue.level);
			}

			if (this.auto != Auto.Off) {
				return this.init(this.host, Anim.Easy);
			}
		}
	}

	set(level, animate)
	{
		this.userLevel = this.level;

		this.UISetMode(this.auto);
		this.UISetLevel(level, animate);
	}

	modeSwitchClicked({isOn})
	{
		const {host, userLevel} = this;

		if (isOn) {
			this.auto = Auto.Usr;

			this.set(userLevel, Anim.Easy);
			sync.set(host, Auto.Usr, userLevel);
		}
		else {
			this.auto = Auto.Off;

			sync.getGlobal().then(
				globLevel => this.set(globLevel, Anim.Easy)
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
		if (this.auto > Auto.Usr) {
			this.UISetMode(this.auto = Auto.Usr);
		}

		sync.set(this.host, this.auto, this.level);
	}

	UISetMode(newMode)
	{
		this.switch.isOn = !!newMode;

		this.scope.textContent = match(newMode,
			[Auto.Off, 'Global'],
			[Auto.Hex, 'Auto-Disabled: Dark Site'],
			[Auto.Img, 'Auto-Disabled: Image'],
			[Auto.Usr, this.host.replace('www.', '')],
		);
	}

	UISetLevel(level, animate)
	{
		this.slider.setValue(level, animate);
	}

	get level()
	{
		return this.slider.getValue();
	}

	viewDidSet(view)
	{
		this.switch = new UISwitch({
			isOn:false,
			target:[this, 'onChange:modeSwitchClicked'],
			superview:[view, 'modeSwitch'],
		});

		new UIStepper({
			styles:'CSAdjustButton',
			image:'UIIconMinus',
			target:[this, 'onInvoke:adjustButtonClicked'],
			value:-Level.MaxStep,
			superview:[view, 'controls'],
		});

		this.slider = new UISlider({
			styles:'CSAdjustSlider',
			range:Range(Level.Min, Level.Max, Level.Step, Level.Min),
			target:[this, 'onChange:onLevelChange'],
			superview:[view, 'controls'],
		});

		new UIStepper({
			styles:'CSAdjustButton',
			image:'UIIconPlus',
			target:[this, 'onInvoke:adjustButtonClicked'],
			value:+Level.MaxStep,
			superview:[view, 'controls'],
		});

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
}

let app = new App;