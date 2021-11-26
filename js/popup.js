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

function RuntimeMessage(kind, data, isAsync = true)
{
	const message = {kind, data, isAsync};

	if (!isAsync) {
		return chrome.runtime.sendMessage(message);
	}

	return new Promise(
		callback => chrome.runtime.sendMessage(message, callback)
	);
}

function Range(min, max, step, value)
{
	return {min, max, step, value};
}

class std
{
	static isNull(var_)
	{
		return var_ == null;
	}

	static define(var_, default_)
	{
		return this.isNull(var_) ? default_ : var_;
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
	static get(key, default_)
	{
		return new Promise(resolve =>
		{
			chrome.storage.local.get(key, r =>
			{
				if (typeof key == 'string')
				{
					r = std.define(r[key], default_);
				}

				resolve(r);
			});
		});
	}

	static set(key, val)
	{
		if (typeof key == 'string')
		{
			key = {[key]:val};
		}

		return new Promise(done => {
			chrome.storage.local.set(key, done);
		});
	}

	static remove(key)
	{
		return new Promise(done => {
			chrome.storage.local.remove(key, done);
		});
	}

	static clear()
	{
		return new Promise(done => {
			chrome.storage.local.clear(done);
		});
	}
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

	static init()
	{
		const a = {
			g:0,
			auto:{},
		};

		return storage.get(null).then(c =>
		{
			const b = {};

			for (const k in a)
			{
				!(k in c) && (b[k] = a[k]);
			}

			return storage.set(b);
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
}

class UIResponder
{
	isChildOf(viewController)
	{
		this.parent = viewController;
	}

	handleAction(action, sender)
	{
		if (action in this && this != sender)
		{
			return this[action](sender);
		}

		if (this.nextResponder)
		{
			this.nextResponder.handleAction(action, sender);
		}
	}

	get nextResponder()
	{
		return this.parent || this.superview;
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
		view.isChildOf(this);

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
		child.isChildOf(this);

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

		this.import('style', 'hidden', 'addEventListener', 'setAttribute', 'querySelector', 'appendChild', 'textContent');
	}

	import()
	{
		const e = this.element;

		for (const x of arguments)
		{
			if (x in this) {
				throw 'cannot redefine property';
			}

			if (typeof e[x] == 'function')
			{
				this[x] = e[x].bind(e);
			}
			else {
				Object.defineProperty(this, x, {
					get() {
						return e[x];
					},
					set(v) {
						e[x] = v;
					}
				});
			}
		}
	}
}

class UIView extends UIElement
{
	constructor(protoId, init)
	{
		super(protoId);

		this.superview;
		this.targets = {};

		if (init) {
			this.init(init);
		}
	}

	init(init)
	{
		if (init.import) {
			this.import(...init.import);
		}

		if (init.target) {
			this.addTarget(...init.target);
		}

		if (init.css) {
			this.addClass(...init.css);
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

	addClass()
	{
		this.element.classList.add(...arguments);
	}

	delClass()
	{
		this.element.classList.remove(...arguments);
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
				return this.appendChild(view.element);
		}
	}

	addSubviews(views, targetId)
	{
		for (const view of views)
		{
			this.addSubview(view, targetId)
		}
	}

	addTarget(target, action, events)
	{
		events = array.cast(events);

		for (const event of events)
		{
			const native = UIView.eventAlias(event);

			if (native) {
				this.addListener(native, 'handleEvent');
			}

			this.targetsFor(event).set(target, action);
		}
	}

	handleEvent(e)
	{
		e.stopPropagation() & this[UIView.eventAlias(e.type)](e);
	}

	onClick()
	{
		this.sendAction('onClick');
	}

	addListener(event, method)
	{
		this.addEventListener(event, this[method].bind(this));
	}

	queryId(id)
	{
		return this.querySelector('#' + id);
	}

	sendAction(event)
	{
		for (const [target, action] of this.targetsFor(event))
		{
			target.handleAction(action, this);
		}
	}

	targetsFor(event)
	{
		return this.targets[event] ||= new Map;
	}

	static eventAlias(name)
	{
		const obj = {
			onClick:'click',
			onPaste:'paste',
			onKeyup:'keyup',
			onEnter:'keyup',
			onFocus:'focus',
		};

		for (const key in obj)
		{
			const val = obj[key];

			if (key == name) return val;
			if (val == name) return key;
		}
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
		super(init);

		this.addListener('pointerdown', 'onPointerDown');
	}

	onPointerDown()
	{
		this.didInvoke();

		this.pressedPid = setTimeout(_ => {
			this.invokedPid = setInterval(_ => this.didInvoke(), 20);
		}, 450);

		document.onpointerup = this.onPointerUp.bind(this);
	}

	onPointerUp()
	{
		clearTimeout(this.pressedPid);
		clearInterval(this.invokedPid);

		document.onpointerup = null;
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
		init.import = ['min', 'max', 'step'];

		super('UISlider', init);

		Object.assign(this, init.range);

		this.addListener('input', 'onChange');
	}

	getValue()
	{
		if (this.animating) {
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

	get animating()
	{
		return this.pid;
	}

	animate(newVal)
	{
		const chg = Math.sign(newVal - this.value) * this.step;

		this.animateEnd();

		this.pid = setInterval(
			_ => FloatCmp(this.value += chg, newVal) && this.animateEnd(), 5
		);

		return Float(newVal);
	}

	animateEnd()
	{
		this.pid = clearInterval(this.pid);
	}

	onChange()
	{
		this.setBackground();

		this.sendAction('onChange');
	}

	setBackground()
	{
		const w = (this.value - this.min) / (this.max - this.min) * 100;

		const a = '--CSSliderFilledColor';
		const b = '--CSSliderRemainColor';

		this.style.background = string.format(
			'linear-gradient(to right, var(%s) 0%, var(%s) %s%, var(%s) %s%, var(%s) 100%)', [a, a, w, b, w, b]
		);
	}
}

class UISwitch extends UISlider
{
	constructor(init)
	{
		init.css = ['CSSwitch'];
		init.range = Range(0, 1, 1, +init.isOn);

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
		view.queryId('shortcuts').addEventListener('click', this.keyShortcuts);
	}

	keyShortcuts()
	{
		chrome.tabs.create({
			url:'chrome://extensions/shortcuts'
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

		chrome.runtime.onMessage.addListener(
			this.onMessage.bind(this)
		);
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
		this.onModeChange(
			this.localLevel = this.level
		);

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

	onChangeExternal(kind, data)
	{
		switch (kind)
		{
			case 'levelDidChange':
				return this.setLevel(data);

			case 'autoModeDisabled':
				return this.init(data, true);
		}
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

		this.hostname.textContent = host;
	}

	disableAutoMode()
	{
		this.onModeChange(
			this.auto = false
		);

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
			case 1: return 'Image';
			case 2: return 'Dark Site';
		}
	}

	onMessage({kind, data})
	{
		this.onChangeExternal(kind, data);
	}

	viewDidSet(view)
	{
		const adjustUp = new UIStepper({
			css:['CSAdjustButton'],
			image:'UIIconPlus',
			target:[this, 'adjustButtonClicked', 'onInvoke'],
			value:+MAX_STEP,
		});

		const adjustDown = new UIStepper({
			css:['CSAdjustButton'],
			image:'UIIconMinus',
			target:[this, 'adjustButtonClicked', 'onInvoke'],
			value:-MAX_STEP,
		});

		const adjustSlider = new UISlider({
			css:['CSAdjustSlider', 'CSFlexItem'],
			range:Range(MIN_LEVEL, MAX_LEVEL, MIN_STEP, MIN_LEVEL),
			target:[this, 'adjustSliderMoved', 'onChange'],
		});

		const localSwitch = new UISwitch({
			isOn:false,
			target:[this, 'localSwitchClicked', 'onChange'],
		});

		view.addSubview(localSwitch, 'localSwitch');
		view.addSubviews([adjustDown, adjustSlider, adjustUp], 'controls');

		this.slider = adjustSlider;
		this.switch = localSwitch;
		this.hostname = view.queryId('hostname');
	}
}

class Main extends ViewController
{
	constructor()
	{
		window.UI = new UIFactory;

		super(
			new UIView('UIDefault')
		);

		tabs.getActive(
			tab => this.init(tab)
		);
	}

	init(tab)
	{
		const host = tabs.host(tab.url);

		if (host)
		{
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

new Main;