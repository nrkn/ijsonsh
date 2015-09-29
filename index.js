'use strict';

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) arr2[i] = arr[i]; return arr2; } else { return Array.from(arr); } }

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

var _readline = require('readline');

var _readline2 = _interopRequireDefault(_readline);

var _chalk = require('chalk');

var _chalk2 = _interopRequireDefault(_chalk);

var _tv4 = require('tv4');

var _tv42 = _interopRequireDefault(_tv4);

var _async = require('async');

var _async2 = _interopRequireDefault(_async);

var _packageJson = require('./package.json');

var _packageJson2 = _interopRequireDefault(_packageJson);

require('./polyfills');

var pathp = _path2['default'].posix;

var rl = _readline2['default'].createInterface({
  input: process.stdin,
  output: process.stdout
});

var _debug = function _debug() {
  for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
    args[_key] = arguments[_key];
  }

  return console.log.apply(console.log, ['[debug]'].concat(args));
};

var types = {
  array: [],
  boolean: false,
  number: 0,
  'null': null,
  object: {},
  string: ''
};

var colors = {
  array: _chalk2['default'].green.bold,
  boolean: _chalk2['default'].blue.bold,
  number: _chalk2['default'].magenta.bold,
  'null': _chalk2['default'].red.bold,
  object: _chalk2['default'].cyan.bold,
  string: _chalk2['default'].yellow.bold,
  value: _chalk2['default'].white.bold,
  'default': _chalk2['default'].grey
};

var typeNames = Object.keys(types);

var Keys = {
  array: function array(node) {
    return [].concat(_toConsumableArray(node.keys()));
  },
  object: function object(node) {
    return Object.keys(node);
  }
};

var sep = '/';

var root = {};
var current = sep;

var Split = function Split(dir) {
  return dir.toString().split(sep).filter(function (s) {
    return s !== '';
  });
};

var ResolveCurrent = function ResolveCurrent(dir) {
  return pathp.resolve(current, dir.toString());
};

var Node = function Node(obj, dir) {
  if (dir === sep) return obj;

  return Split(ResolveCurrent(dir)).reduce(function (target, seg) {
    return target[seg];
  }, obj);
};

var Type = function Type(obj) {
  return typeNames.reduce(function (name, typeName) {
    return !name && _tv42['default'].validate(obj, { type: typeName }) ? typeName : name;
  }, undefined);
};

var File = function File(obj, dir) {
  var value = Node(obj, dir);
  var size = JSON.stringify(value).length;
  var type = Type(value);
  var name = Split(dir).pop();
  var iterable = (type in Keys);
  return { type: type, name: name, iterable: iterable, size: size, value: value };
};

var IsNode = function IsNode(obj, dir) {
  return Node(obj, dir) !== undefined;
};

var IsPath = function IsPath(obj, dir) {
  var node = Node(obj, dir);
  var type = Type(node);
  return type in Keys;
};

var Files = function Files(obj, dir) {
  var node = Node(obj, dir);
  var type = Type(node);
  var relative = ['.'].concat(obj === node ? [] : '..');
  var keys = Keys[type] ? Keys[type](node) : [];

  return keys.concat(relative).map(function (name) {
    return File(root, name);
  });
};

var Column = function Column(text) {
  var color = arguments.length <= 1 || arguments[1] === undefined ? colors['default'] : arguments[1];
  var align = arguments.length <= 2 || arguments[2] === undefined ? 'left' : arguments[2];

  return { text: text.toString(), color: color, align: align };
};

var Listing = function Listing(file) {
  return [Column(file.name, file.iterable ? colors[file.type] : colors.value), Column(file.iterable ? '...' : JSON.stringify(file.value), file.iterable ? colors['default'] : colors[file.type]), Column(file.type), Column(file.size, colors['default'], 'right')];
};

var FormatListing = function FormatListing(listing) {
  var widths = arguments.length <= 1 || arguments[1] === undefined ? false : arguments[1];
  return listing.map(function (column, i) {
    return widths ? column.color(SetWidth(column.text, widths[i], column.align)) : column.color(column.text);
  }).join('    ');
};

var SetWidth = function SetWidth(str, width, align) {
  var len = str.length;

  if (len < width) {
    var padding = ' '.repeat(width - len);

    if (align === 'right') return padding + str;

    return str + padding;
  }

  return str;
};

var Table = function Table(files) {
  var listings = files.map(Listing);

  var widths = listings.reduce(function (widths, listing) {
    listing.forEach(function (col, i) {
      widths[i] = widths[i] || 0;

      widths[i] = Math.max(widths[i], col.text.length);
    });
    return widths;
  }, {});

  return '\n' + listings.map(function (listing) {
    return FormatListing(listing, widths);
  }).join('\n') + '\n';
};

var Job = function Job(name, args) {
  var silent = arguments.length <= 2 || arguments[2] === undefined ? false : arguments[2];

  return { name: name, args: args, silent: silent };
};

var batch = function batch(jobs, cb) {
  return _async2['default'].reduce(jobs, '', function (output, job, next) {
    return commands[job.name](job.args, function (err, out) {
      if (err) {
        next(err);
        return;
      }

      next(null, job.silent ? output : output + out);
    });
  }, cb);
};

var _load = function _load(fn, cb) {
  var filename = fn.endsWith('.json') ? fn : fn + '.json';

  _fs2['default'].readFile(filename, 'utf8', function (err, json) {
    if (err) {
      cb(err);
      return;
    }

    cb(null, JSON.parse(json));
  });
};

var _save = function _save(filename, cb) {
  return _fs2['default'].writeFile(filename, JSON.stringify(Node(root, current)), 'utf8', cb);
};

var commands = {
  ls: function ls(args, cb) {
    if (!args.length) {
      cb(null, Table(Files(root, current)));
      return;
    }

    var cwd = current;
    var jobs = [Job('cd', args, true), Job('ls', []), Job('cd', [cwd], true)];

    batch(jobs, cb);
  },

  clear: function clear(args, cb) {
    return cb(null, '\u001b[2J\u001b[0;0H');
  },

  cd: function cd(args, cb) {
    var p = ResolveCurrent(args.join(' ').trim());

    if (!IsPath(root, p)) {
      cb(null, '\nPath not found\n');
      return;
    }

    current = p;

    cb(null, '');
  },

  set: function set(args, cb) {
    var node = Node(root, current);
    var key = args[0];
    var value = args.splice(1).join(' ');

    node[key] = JSON.parse(value);

    var file = File(root, pathp.join(current, key));
    var listing = FormatListing(Listing(file));

    cb(null, '\n' + listing + '\n');
  },

  rm: function rm(args, cb) {
    var node = Node(root, current);
    var key = args[0];

    if (!key in node) {
      cb(null, '\nProperty not found\n');
      return;
    }

    delete node[key];

    cb(null, '\nRemoved ' + key + '\n');
  },

  json: function json(args, cb) {
    return cb(null, '\n' + JSON.stringify(Node(root, current), null, 2) + '\n');
  },

  ver: function ver(args, cb) {
    return cb(null, '\n' + _packageJson2['default'].name + ' ' + _packageJson2['default'].version + '\n');
  },

  load: function load(args, cb) {
    _load(args[0], function (err, obj) {
      if (err) {
        cb(err);
        return;
      }

      root = obj;
      current = sep;

      commands.json([], cb);
    });
  },

  save: function save(args, cb) {
    _save(args[0], function (err) {
      if (err) {
        cb(err);
        return;
      }

      cb(null, '\nSaved ' + args[0] + '\n');
    });
  },

  help: function help(args, cb) {
    return cb(null, '\n' + [colors.value('json') + ' - view current node as json', colors.value('ls [path]') + ' - list contents of object or array node, defaults to cwd', colors.value('cd path') + ' - navigate to an object or array element node', colors.value('set property value') + ' - set property on current node to value', colors.value('rm property') + ' - removes a property from current node', colors.value('load path') + ' - load JSON from file', colors.value('save path') + ' - save current node to file', colors.value('ver') + ' - current version', colors.value('clear') + ' - clear screen'].join('\n') + '\n');
  },

  '': function _(args, cb) {
    return cb(null);
  }
};

var aliases = {
  dir: 'ls',
  cls: 'clear',
  value: 'json',
  val: 'json'
};

Object.keys(aliases).forEach(function (alias) {
  return commands[alias] = commands[aliases[alias]];
});

var Prompt = function Prompt() {
  var node = Node(root, current);
  var type = Type(node);
  var color = colors[type];

  return colors.value(current + ':') + color(type) + colors.value('>');
};

var loop = function loop() {
  rl.question(Prompt(), function (input) {
    var args = input.split(' ');
    var command = args.shift().trim().toLowerCase();

    if (['quit', 'exit'].includes(command)) {
      rl.close();
      return;
    }

    if (command in commands) {
      commands[command](args, function (err, output) {
        if (err) {
          rl.close();
          console.error(err);
          return;
        }

        if (output !== undefined) console.log(output);
        loop();
      });
    } else {
      console.log('\nCommand not found\n');
      loop();
    }
  });
};

if (process.argv.length > 2) {
  _load(process.argv[2], function (err) {
    if (err) {
      rl.close();
      throw err;
      return;
    }

    loop();
  });
} else {
  loop();
}
