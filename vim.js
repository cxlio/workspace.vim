(ide => {
"use strict";
const
	MOTION = {
		h: 'cursor.goBackwards',
		'mod+h': 'cursor.goBackwards',
		l: 'cursor.goForward',
		0: 'line.goStart',
		$: 'line.goEnd',
		home: 'line.goStart',
		end: 'line.goEnd',
		'mod+home': 'cursor.goStart',
		'mod+end': 'cursor.goEnd',
		'shift+g': 'cursor.goEnd',
		'shift+left': 'word.goNext',
		'shift+right': 'word.goPrevious',
		k: 'cursor.goUp',
		j: 'cursor.goDown',
		'mod+j': 'cursor.goDown',
		'mod+p': 'cursor.goUp',
		w: 'word.goNext',
		b: 'word.goPrevious',
		down: 'cursor.goDown',
		up: 'cursor.goUp',
		right: 'cursor.goForward',
		left: 'cursor.goBackwards',
		pagedown: 'page.goDown',
		pageup: 'page.goUp'
	},

	PRINTCHAR = {
		plus: '+',
		space: ' ',
		tab: "\t"
	}
;

function map(keymap, prefix, postfix)
{
	var result = {}, k, v;

	for (k in keymap)
	{
		v = keymap[k];
		result[k] = count((prefix ? prefix + '; ' : '') + v + (postfix ? '; ' + postfix : ''));
	}

	return result;
}

function count(action, def)
{
	const handler = ide.action(action);

	function fn() {
		var i = vim.count || def || 1;
		while (i--)
			handler();

		vim.count = null;
	}

	fn.action = action;
	return fn;
}

function countParam(action)
{
	function fn() {
		ide.run(action, [ vim.count ]);
		vim.count = null;
	}

	fn.action = action;
	return fn;
}

function parseSubstituteParameters(search, replace, options)
{
const
	split = replace.search(/[^\\]\//),
	range = { line: ide.editor.rowStart }
;
	if (split !== -1)
	{
		options = replace.slice(split+2);
		replace = replace.slice(0, split+1);
	}

	if (options && options.includes('g'))
		search = new RegExp(search.source, 'g');

	return [ search, replace, options ];
}

function substituteRange(range, search, replace, options)
{
	const newLine = range.value.replace(search, replace);
	range.replace(newLine);
}

/**
 * Helper function for commands. Makes sure there is a valid editor
 */
function setState(name)
{
	function fn() {
		if (ide.editor)
			ide.editor.keymap.setState(name);
		else
			ide.keymap.setState(name);
	}

	fn.action = name;
	return fn;
}

function setRegister(name)
{
	return function() {
		vim.register = vim.registers[name] || vim.defaultRegister;
		ide.editor.keymap.setState('vim');
	};
}

function yank(data)
{
	vim.register.set(data);

	for (var i=9; i>0; i--)
		vim.registers[i].set(vim.registers[i-1].data);

	vim.registers[0].set(data);
}

function enterCountMode(key) {
	vim.count = key;
	ide.editor.keymap.setState('vim-count');
}

class Register
{
	constructor(name)
	{
		this.name = name;
		this.update();
	}

	update()
	{
		this.data = vim.data('register.' + this.name);
	}

	set(data)
	{
		this.data = data || '';
		vim.data('register.' + this.name, this.data);
		vim.register = vim.defaultRegister;
		ide.plugins.trigger('vim.register.change', this);
	}
}

const vim = new ide.Plugin({

	registers: null,
	// Active register
	register: null,
	// Default Reigster (")
	defaultRegister: null,
	dotRegister: null,
	clipboardRegister: null,
	// Current Count
	count: null,

	icon: 'vim',

	setupEditor(editor)
	{
		// VIM Mode only supported for editors that have the cursor feature.
		if (editor.cursor)
		{
			// Start in normal mode
			editor.keymap.setState('vim');
			editor.cmd('insert.disable');
			editor.cmd('selection.showCursor');
		}
	},

	initRegisters()
	{
		var r = this.registers = {
			'"': this.register = this.defaultRegister = new Register('"'),
			'.': this.dotRegister = new Register('.'),
			'*': this.clipboardRegister = new Register('*')
		};

		for (var i=0; i<10; i++)
			r[i] = new Register(i);
	},

	updateRegisters()
	{
		for (var i in this.registers)
			this.registers[i].update();
	},

	onFocus()
	{
		this.updateRegisters();
	},

	ready()
	{
		var keymap = ide.project.get('keymap');

		if (keymap && keymap!=='vim')
			return;

		this.initRegisters();

		ide.resources.registerSVGIcon('vim', '<g stroke="#000" stroke-width="5"><path fill="#19953f" d="M128 9L8 130l119 120 120-121L128 9z"/><path fill="#d0d0cf" d="M26 21l-5 5v19l6 5h7v168l7 8h22L241 46V27l-5-5-80-1-5 7v16l5 7h6l-62 60V51h8l5-6V29l-6-7-81-1z"/><path fill="#d0d0cf" d="M137 137l4-4 12 1 4 4-4 12-4 3h-12l-4-4 4-12zM122 160h28l-15 45h6l-3 9h-27l14-44-7 1 4-11zM157 160l-3 10h6l-15 44h24l3-9h-6l8-26 15-1-11 35 23 1 3-9h-5l9-26h13l-11 35h24l3-8-6-1 12-37-5-7h-14l-6 6h-6l-6-7h-12l-6 6h-6l-6-6h-19z"/></g>', '0 0 256 256');

		ide.plugins.on('workspace.add', this.setupEditor, this);
		window.addEventListener('focus', this.onFocus.bind(this));
	},

	editorCommands: {

		cn: 'hints.next',
		cnext: 'hints.next',
		y: 'yank',

		yank() {
			yank(ide.editor.selection.value);
		},

		yankBlock()
		{
		var
			editor = ide.editor,
			data = editor.selection.somethingSelected() ?
				editor.selection.value :
				editor.line.value
		;
			yank("\n" + data);
		},

		foldopen: 'fold.open',
		foldclose: 'fold.close',

		'insert.register.dot'()
		{
			ide.editor.cmd('insert', [ vim.dotRegister.data ]);
		},

		insertCharBelow()
		{
			var e = ide.editor, pos, ch;

			if (e && e.getPosition && e.getChar && e.insert)
			{
				pos = e.getPosition();
				pos.line += 1;
				ch = e.getChar(pos);

				if (ch)
					e.insert(ch);
			}
		},

		put() {
		var
			editor = ide.editor,
			data = this.register.data
		;
			if (data[0]==="\n" && !editor.selection.somethingSelected())
				editor.cmd('line.goEnd');

			editor.selection.replace(this.register.data);
		},

		// Line search and replace
		s(search, replace, options)
		{
			if (!ide.editor.line)
				return;

			[ search, replace, options ] = parseSubstituteParameters(search, replace, options);
			substituteRange(ide.editor.line.current, search, replace, options);
		},

		substitute: 's',

		// Whole file search and replace
		'%s'(search, replace, options)
		{
			if (!ide.editor.range)
				return;

			[ search, replace, options ] = parseSubstituteParameters(search, replace, options);
			substituteRange(ide.editor.document.getRange(), search, replace, options);
		},

		'vim.swapCase'()
		{
		var
			editor = ide.editor,
			current = editor.cursor.value,
			row, col, upper
		;
			if (current)
			{
				upper = current.toUpperCase();

				if (upper === current)
					upper = current.toLowerCase();

				row = editor.cursor.row;
				col = editor.cursor.column;

				editor.range.create(row, col, row, col+1).replace(upper);
				editor.cursor.goForward();
			}
		},

		'vim.mode.insert'()
		{
		var
			editor = ide.editor,
			support = editor.cmd('insert.enable')
		;
			if (support !== ide.Pass)
				editor.keymap.setState('vim-insert');
		},

		'vim.mode.normal'()
		{
		var
			editor = ide.editor,
			lastInsert = editor.cmd('history.lastInsert')
		;
			if (lastInsert===ide.Pass)
				lastInsert = '';

			editor.keymap.setState('vim');
			editor.cmd('insert.disable');
			editor.cmd('selection.clear');

			if (lastInsert)
				vim.dotRegister.set(lastInsert);
		},

		'vim.mode.change': setState('vim-change'),
		'vim.mode.select': setState('vim-select'),
		'vim.mode.delete': setState('vim-delete'),
		'vim.mode.yank': setState('vim-yank'),
		'vim.mode.replace': setState('vim-replace'),
		'vim.mode.blockSelect': setState('vim-block-select'),
		'vim.mode.register': setState('vim-register')
	},

	commands: {

		messages: 'log',

		registers: {

			fn()
			{
				var i, editor, registers=this.registers;

				function getRegisterItems()
				{
					const children = [];

					for (var i in registers)
						children.push({
							code: i,
							html: '<pre>' + cxl.escape(registers[i].data || '') + '</pre>'
						});

					return children;
				}

				editor = new ide.ListEditor({
					title: 'registers',
					plugin: this,
					children: getRegisterItems()
				});

				editor.listenTo(ide.plugins, 'vim.register.change', function() {
					editor.reset();
					editor.add(getRegisterItems());
				});

				return editor;
			},
			description: 'Display the contents of all numbered and named registers'

		}

	},

	// Vim style bindings. NOTE Follow vimdoc index order
	shortcuts: {

		vim: cxl.extend({

			backspace: count('cursor.goBackwards'),
			space: count('cursor.goForward'),
			'/': 'searchbar',
			'?': 'searchbarReverse',
			'*': 'search',
			'< <': count('indent.less'),
			'= =': 'indent.auto',
			'> >': count('indent.more'),
			'&': count('searchReplace'),
			'"': setState('vim-register'),
			':': 'ex',
			'#': count('findPrev'),
			// TODO ?
			'~': count('vim.swapCase'),

			'f1': 'help',
			'f10': 'assist',

			1: enterCountMode,
			2: enterCountMode,
			3: enterCountMode,
			4: enterCountMode,
			5: enterCountMode,
			6: enterCountMode,
			7: enterCountMode,
			8: enterCountMode,
			9: enterCountMode,

			'mod+[': 'vim.mode.normal',
			'mod+b': count('scrollScreenUp'),
			'mod+d': countParam('scrollLineDown'),
			'mod+f': count('scrollScreenDown'),
			'mod+g': 'showInfo',
			'mod+r': count('history.redo'),
			'mod+u': countParam('scrollLineUp'),
			'mod+y': countParam('scrollLineDown'),

			'shift+a': 'line.goEnd; vim.mode.insert',
			'shift+c': 'select.begin; line.goEnd; select.end; selection.remove; vim.mode.insert',
			'shift+d': 'delWrappedLineRight; vim.mode.insert',
			'shift+o': 'cursor.goUp; line.goEnd; vim.mode.insert; insert.line',
			'shift+n': count('search.previous'),
			'shift+v': 'line.select; vim.mode.blockSelect',
			'shift+y': 'yankBlock',

			'a': count('cursor.goForward; vim.mode.insert'),
			'c': 'vim.mode.change',
			'd': 'vim.mode.delete',
			'g': setState('vim-go'),
			'g a': 'ascii',
			'g shift+d': 'ijump',
			'g t': 'workspace.next',
			'g g': 'cursor.goStart',
			'g shift+t': 'workspace.previous',
			'g f': 'find',
			'i': 'vim.mode.insert',
			'n': count('search.next'),
			'o': 'line.goEnd; vim.mode.insert; insert.line',
			'p': count('put'),
			'r': 'vim.mode.replace',
			'u': count('history.undo'),
			'v': 'vim.mode.select',
			'y': 'vim.mode.yank',
			'z c': 'fold.close',
			'z o': 'fold.open',

			insert: 'vim.mode.insert',
			enter: 'cursor.enter'

		}, map(MOTION)),

		'vim-go': {
			a: 'ascii; vim.mode.normal',
			'shift+d': 'ijump; vim.mode.normal',
			t: count('vim.mode.normal; workspace.next'),
			g: 'cursor.goStart; vim.mode.normal',
			'shift+t': count('vim.mode.normal; workspace.previous;'),
			f: 'vim.mode.normal; find',
			all: 'vim.mode.normal'
		},

		'vim-count': {
			esc: 'vim.mode.normal',
			'mod+[': 'vim.mode.normal',

			all(key)
			{
				if (key.length===1 && /\d/.test(key))
					vim.count += key;
				else
				{
					vim.editorCommands['vim.mode.normal']();
					ide.keyboard.handleKey(key);
				}
			}
		},

		'vim-register': {
			'"': setRegister('"'),
			'.': setRegister('.'),
			'*': setRegister('*'),
			0: setRegister(0),
			1: setRegister(1),
			2: setRegister(2),
			3: setRegister(3),
			4: setRegister(4),
			5: setRegister(5),
			6: setRegister(6),
			7: setRegister(7),
			8: setRegister(8),
			9: setRegister(9),

			all()
			{
				ide.run('vim.mode.normal');
			}
		},

		'vim-replace': {

			esc: 'vim.mode.normal',
			'mod+[': 'vim.mode.normal',

			all(key) {

				if (key in PRINTCHAR)
					key = PRINTCHAR[key];

				if (ide.editor && ide.editor.replaceSelection &&
					key.length===1)
					ide.editor.replaceSelection(key);
				ide.run('vim.mode.normal');
			}

		},

		'vim-yank': cxl.extend({
			esc: 'vim.mode.normal',
			'mod+[': 'vim.mode.normal',
			'y': 'yankBlock; vim.mode.normal'
		}, map(MOTION, 'selection.begin', 'selection.end; yank; selection.clear; vim.mode.normal')),

		'vim-change': cxl.extend({
			esc: 'vim.mode.normal',
			'mod+[': 'vim.mode.normal'
		}, map(MOTION, 'selection.begin', 'selection.end; selection.remove; vim.mode.insert')),

		'vim-delete': cxl.extend({
			esc: 'vim.mode.normal',
			'mod+[': 'vim.mode.normal',
			'd': count('yankBlock; line.remove; vim.mode.normal'),
		}, map(MOTION, 'selection.begin', 'selection.end; yank; selection.remove; vim.mode.normal')),

		'vim-select': cxl.extend({
			'd': 'yank; selection.remove; vim.mode.normal',
			'y': 'yank; vim.mode.normal',
			'>': count('indent.more; vim.mode.normal'),
			'<': count('indent.less; vim.mode.normal'),
			'p': count('put; vim.mode.normal'),
			'=': 'indent.auto; vim.mode.normal',
			':': 'ex',

			esc: 'vim.mode.normal',
			'mod+[': 'vim.mode.normal'
		}, map(MOTION, 'selection.begin', 'selection.end')),

		'vim-block-select': cxl.extend({
			d: 'yankBlock; selection.remove; vim.mode.normal',
			y: 'yankBlock; vim.mode.normal',
			p: count('put; vim.mode.normal'),
			'>': count('indent.more; vim.mode.normal'),
			'<': count('indent.less; vim.mode.normal'),
			'=': 'indent.auto; vim.mode.normal',
			':': 'ex',

			esc: 'vim.mode.normal',
			'mod+[': 'vim.mode.normal'
		 }, map(MOTION, 'selection.begin', 'line.select; selection.end')),

		'vim-insert': {
			'mod+@': 'insertDotRegister; vim.mode.normal',
			'mod+a': 'insertDotRegister',
			'mod+d': 'indent.less',
			'mod+h': 'insert.backspace',
			'mod+i': 'insert.tab',
			'mod+j': 'insert.line',
			'mod+m': 'insert.line',
			'mod+n': 'search',
			'mod+t': 'indent.more',
			'mod+w': 'word.removeNext',
			'alt+enter': 'ex',
			'f1': 'help',
			'f10': 'assist',

			backspace: 'insert.backspace',
			tab: 'insert.tab',
			del: 'insert.del',
			pageup: 'page.goUp',
			pagedown: 'page.goDown',
			down: 'cursor.goDown',
			up: 'cursor.goUp',
			right: 'cursor.goForward',
			left: 'cursor.goBackwards',
			end: 'line.goEnd',
			home: 'line.goStart',
			enter: 'insert.line',
			'shift+up': 'page.goUp',
			'shift+down': 'page.goDown',
			'mod+home': 'cursor.goStart',
			'mod+end': 'cursor.goEnd',
			'mod+backspace': 'word.removePrevious',
			'mod+left': 'word.goPrevious',
			'mod+right': 'word.goNext',
			'shift+left': 'word.goPrevious',
			'shift+right': 'word.goNext',
			'esc': 'vim.mode.normal',
			'mod+[': 'vim.mode.normal',
			'mod+del': 'word.removeNext'
		}
	}

});

ide.keymap.defaultState = 'vim';
ide.plugins.register('vim', vim);
ide.plugins.on('editor.keymap', function(keymap, editor) {
	editor.header.setTag('state', keymap.state);
});

})(this.ide);
