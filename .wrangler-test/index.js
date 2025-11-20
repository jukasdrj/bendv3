var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// node_modules/unenv/dist/runtime/_internal/utils.mjs
// @__NO_SIDE_EFFECTS__
function createNotImplementedError(name) {
  return new Error(`[unenv] ${name} is not implemented yet!`);
}
__name(createNotImplementedError, "createNotImplementedError");
// @__NO_SIDE_EFFECTS__
function notImplemented(name) {
  const fn = /* @__PURE__ */ __name(() => {
    throw /* @__PURE__ */ createNotImplementedError(name);
  }, "fn");
  return Object.assign(fn, { __unenv__: true });
}
__name(notImplemented, "notImplemented");
// @__NO_SIDE_EFFECTS__
function notImplementedClass(name) {
  return class {
    __unenv__ = true;
    constructor() {
      throw new Error(`[unenv] ${name} is not implemented yet!`);
    }
  };
}
__name(notImplementedClass, "notImplementedClass");

// node_modules/unenv/dist/runtime/node/internal/perf_hooks/performance.mjs
var _timeOrigin = globalThis.performance?.timeOrigin ?? Date.now();
var _performanceNow = globalThis.performance?.now ? globalThis.performance.now.bind(globalThis.performance) : () => Date.now() - _timeOrigin;
var nodeTiming = {
  name: "node",
  entryType: "node",
  startTime: 0,
  duration: 0,
  nodeStart: 0,
  v8Start: 0,
  bootstrapComplete: 0,
  environment: 0,
  loopStart: 0,
  loopExit: 0,
  idleTime: 0,
  uvMetricsInfo: {
    loopCount: 0,
    events: 0,
    eventsWaiting: 0
  },
  detail: void 0,
  toJSON() {
    return this;
  }
};
var PerformanceEntry = class {
  static {
    __name(this, "PerformanceEntry");
  }
  __unenv__ = true;
  detail;
  entryType = "event";
  name;
  startTime;
  constructor(name, options) {
    this.name = name;
    this.startTime = options?.startTime || _performanceNow();
    this.detail = options?.detail;
  }
  get duration() {
    return _performanceNow() - this.startTime;
  }
  toJSON() {
    return {
      name: this.name,
      entryType: this.entryType,
      startTime: this.startTime,
      duration: this.duration,
      detail: this.detail
    };
  }
};
var PerformanceMark = class PerformanceMark2 extends PerformanceEntry {
  static {
    __name(this, "PerformanceMark");
  }
  entryType = "mark";
  constructor() {
    super(...arguments);
  }
  get duration() {
    return 0;
  }
};
var PerformanceMeasure = class extends PerformanceEntry {
  static {
    __name(this, "PerformanceMeasure");
  }
  entryType = "measure";
};
var PerformanceResourceTiming = class extends PerformanceEntry {
  static {
    __name(this, "PerformanceResourceTiming");
  }
  entryType = "resource";
  serverTiming = [];
  connectEnd = 0;
  connectStart = 0;
  decodedBodySize = 0;
  domainLookupEnd = 0;
  domainLookupStart = 0;
  encodedBodySize = 0;
  fetchStart = 0;
  initiatorType = "";
  name = "";
  nextHopProtocol = "";
  redirectEnd = 0;
  redirectStart = 0;
  requestStart = 0;
  responseEnd = 0;
  responseStart = 0;
  secureConnectionStart = 0;
  startTime = 0;
  transferSize = 0;
  workerStart = 0;
  responseStatus = 0;
};
var PerformanceObserverEntryList = class {
  static {
    __name(this, "PerformanceObserverEntryList");
  }
  __unenv__ = true;
  getEntries() {
    return [];
  }
  getEntriesByName(_name, _type) {
    return [];
  }
  getEntriesByType(type) {
    return [];
  }
};
var Performance = class {
  static {
    __name(this, "Performance");
  }
  __unenv__ = true;
  timeOrigin = _timeOrigin;
  eventCounts = /* @__PURE__ */ new Map();
  _entries = [];
  _resourceTimingBufferSize = 0;
  navigation = void 0;
  timing = void 0;
  timerify(_fn, _options) {
    throw createNotImplementedError("Performance.timerify");
  }
  get nodeTiming() {
    return nodeTiming;
  }
  eventLoopUtilization() {
    return {};
  }
  markResourceTiming() {
    return new PerformanceResourceTiming("");
  }
  onresourcetimingbufferfull = null;
  now() {
    if (this.timeOrigin === _timeOrigin) {
      return _performanceNow();
    }
    return Date.now() - this.timeOrigin;
  }
  clearMarks(markName) {
    this._entries = markName ? this._entries.filter((e) => e.name !== markName) : this._entries.filter((e) => e.entryType !== "mark");
  }
  clearMeasures(measureName) {
    this._entries = measureName ? this._entries.filter((e) => e.name !== measureName) : this._entries.filter((e) => e.entryType !== "measure");
  }
  clearResourceTimings() {
    this._entries = this._entries.filter((e) => e.entryType !== "resource" || e.entryType !== "navigation");
  }
  getEntries() {
    return this._entries;
  }
  getEntriesByName(name, type) {
    return this._entries.filter((e) => e.name === name && (!type || e.entryType === type));
  }
  getEntriesByType(type) {
    return this._entries.filter((e) => e.entryType === type);
  }
  mark(name, options) {
    const entry = new PerformanceMark(name, options);
    this._entries.push(entry);
    return entry;
  }
  measure(measureName, startOrMeasureOptions, endMark) {
    let start;
    let end;
    if (typeof startOrMeasureOptions === "string") {
      start = this.getEntriesByName(startOrMeasureOptions, "mark")[0]?.startTime;
      end = this.getEntriesByName(endMark, "mark")[0]?.startTime;
    } else {
      start = Number.parseFloat(startOrMeasureOptions?.start) || this.now();
      end = Number.parseFloat(startOrMeasureOptions?.end) || this.now();
    }
    const entry = new PerformanceMeasure(measureName, {
      startTime: start,
      detail: {
        start,
        end
      }
    });
    this._entries.push(entry);
    return entry;
  }
  setResourceTimingBufferSize(maxSize) {
    this._resourceTimingBufferSize = maxSize;
  }
  addEventListener(type, listener, options) {
    throw createNotImplementedError("Performance.addEventListener");
  }
  removeEventListener(type, listener, options) {
    throw createNotImplementedError("Performance.removeEventListener");
  }
  dispatchEvent(event) {
    throw createNotImplementedError("Performance.dispatchEvent");
  }
  toJSON() {
    return this;
  }
};
var PerformanceObserver = class {
  static {
    __name(this, "PerformanceObserver");
  }
  __unenv__ = true;
  static supportedEntryTypes = [];
  _callback = null;
  constructor(callback) {
    this._callback = callback;
  }
  takeRecords() {
    return [];
  }
  disconnect() {
    throw createNotImplementedError("PerformanceObserver.disconnect");
  }
  observe(options) {
    throw createNotImplementedError("PerformanceObserver.observe");
  }
  bind(fn) {
    return fn;
  }
  runInAsyncScope(fn, thisArg, ...args) {
    return fn.call(thisArg, ...args);
  }
  asyncId() {
    return 0;
  }
  triggerAsyncId() {
    return 0;
  }
  emitDestroy() {
    return this;
  }
};
var performance = globalThis.performance && "addEventListener" in globalThis.performance ? globalThis.performance : new Performance();

// node_modules/@cloudflare/unenv-preset/dist/runtime/polyfill/performance.mjs
globalThis.performance = performance;
globalThis.Performance = Performance;
globalThis.PerformanceEntry = PerformanceEntry;
globalThis.PerformanceMark = PerformanceMark;
globalThis.PerformanceMeasure = PerformanceMeasure;
globalThis.PerformanceObserver = PerformanceObserver;
globalThis.PerformanceObserverEntryList = PerformanceObserverEntryList;
globalThis.PerformanceResourceTiming = PerformanceResourceTiming;

// node_modules/unenv/dist/runtime/node/console.mjs
import { Writable } from "node:stream";

// node_modules/unenv/dist/runtime/mock/noop.mjs
var noop_default = Object.assign(() => {
}, { __unenv__: true });

// node_modules/unenv/dist/runtime/node/console.mjs
var _console = globalThis.console;
var _ignoreErrors = true;
var _stderr = new Writable();
var _stdout = new Writable();
var log = _console?.log ?? noop_default;
var info = _console?.info ?? log;
var trace = _console?.trace ?? info;
var debug = _console?.debug ?? log;
var table = _console?.table ?? log;
var error = _console?.error ?? log;
var warn = _console?.warn ?? error;
var createTask = _console?.createTask ?? /* @__PURE__ */ notImplemented("console.createTask");
var clear = _console?.clear ?? noop_default;
var count = _console?.count ?? noop_default;
var countReset = _console?.countReset ?? noop_default;
var dir = _console?.dir ?? noop_default;
var dirxml = _console?.dirxml ?? noop_default;
var group = _console?.group ?? noop_default;
var groupEnd = _console?.groupEnd ?? noop_default;
var groupCollapsed = _console?.groupCollapsed ?? noop_default;
var profile = _console?.profile ?? noop_default;
var profileEnd = _console?.profileEnd ?? noop_default;
var time = _console?.time ?? noop_default;
var timeEnd = _console?.timeEnd ?? noop_default;
var timeLog = _console?.timeLog ?? noop_default;
var timeStamp = _console?.timeStamp ?? noop_default;
var Console = _console?.Console ?? /* @__PURE__ */ notImplementedClass("console.Console");
var _times = /* @__PURE__ */ new Map();
var _stdoutErrorHandler = noop_default;
var _stderrErrorHandler = noop_default;

// node_modules/@cloudflare/unenv-preset/dist/runtime/node/console.mjs
var workerdConsole = globalThis["console"];
var {
  assert,
  clear: clear2,
  // @ts-expect-error undocumented public API
  context,
  count: count2,
  countReset: countReset2,
  // @ts-expect-error undocumented public API
  createTask: createTask2,
  debug: debug2,
  dir: dir2,
  dirxml: dirxml2,
  error: error2,
  group: group2,
  groupCollapsed: groupCollapsed2,
  groupEnd: groupEnd2,
  info: info2,
  log: log2,
  profile: profile2,
  profileEnd: profileEnd2,
  table: table2,
  time: time2,
  timeEnd: timeEnd2,
  timeLog: timeLog2,
  timeStamp: timeStamp2,
  trace: trace2,
  warn: warn2
} = workerdConsole;
Object.assign(workerdConsole, {
  Console,
  _ignoreErrors,
  _stderr,
  _stderrErrorHandler,
  _stdout,
  _stdoutErrorHandler,
  _times
});
var console_default = workerdConsole;

// node_modules/wrangler/_virtual_unenv_global_polyfill-@cloudflare-unenv-preset-node-console
globalThis.console = console_default;

// node_modules/unenv/dist/runtime/node/internal/process/hrtime.mjs
var hrtime = /* @__PURE__ */ Object.assign(/* @__PURE__ */ __name(function hrtime2(startTime) {
  const now = Date.now();
  const seconds = Math.trunc(now / 1e3);
  const nanos = now % 1e3 * 1e6;
  if (startTime) {
    let diffSeconds = seconds - startTime[0];
    let diffNanos = nanos - startTime[0];
    if (diffNanos < 0) {
      diffSeconds = diffSeconds - 1;
      diffNanos = 1e9 + diffNanos;
    }
    return [diffSeconds, diffNanos];
  }
  return [seconds, nanos];
}, "hrtime"), { bigint: /* @__PURE__ */ __name(function bigint() {
  return BigInt(Date.now() * 1e6);
}, "bigint") });

// node_modules/unenv/dist/runtime/node/internal/process/process.mjs
import { EventEmitter } from "node:events";

// node_modules/unenv/dist/runtime/node/internal/tty/read-stream.mjs
var ReadStream = class {
  static {
    __name(this, "ReadStream");
  }
  fd;
  isRaw = false;
  isTTY = false;
  constructor(fd) {
    this.fd = fd;
  }
  setRawMode(mode) {
    this.isRaw = mode;
    return this;
  }
};

// node_modules/unenv/dist/runtime/node/internal/tty/write-stream.mjs
var WriteStream = class {
  static {
    __name(this, "WriteStream");
  }
  fd;
  columns = 80;
  rows = 24;
  isTTY = false;
  constructor(fd) {
    this.fd = fd;
  }
  clearLine(dir3, callback) {
    callback && callback();
    return false;
  }
  clearScreenDown(callback) {
    callback && callback();
    return false;
  }
  cursorTo(x, y, callback) {
    callback && typeof callback === "function" && callback();
    return false;
  }
  moveCursor(dx, dy, callback) {
    callback && callback();
    return false;
  }
  getColorDepth(env2) {
    return 1;
  }
  hasColors(count3, env2) {
    return false;
  }
  getWindowSize() {
    return [this.columns, this.rows];
  }
  write(str, encoding, cb) {
    if (str instanceof Uint8Array) {
      str = new TextDecoder().decode(str);
    }
    try {
      console.log(str);
    } catch {
    }
    cb && typeof cb === "function" && cb();
    return false;
  }
};

// node_modules/unenv/dist/runtime/node/internal/process/node-version.mjs
var NODE_VERSION = "22.14.0";

// node_modules/unenv/dist/runtime/node/internal/process/process.mjs
var Process = class _Process extends EventEmitter {
  static {
    __name(this, "Process");
  }
  env;
  hrtime;
  nextTick;
  constructor(impl) {
    super();
    this.env = impl.env;
    this.hrtime = impl.hrtime;
    this.nextTick = impl.nextTick;
    for (const prop of [...Object.getOwnPropertyNames(_Process.prototype), ...Object.getOwnPropertyNames(EventEmitter.prototype)]) {
      const value = this[prop];
      if (typeof value === "function") {
        this[prop] = value.bind(this);
      }
    }
  }
  // --- event emitter ---
  emitWarning(warning, type, code) {
    console.warn(`${code ? `[${code}] ` : ""}${type ? `${type}: ` : ""}${warning}`);
  }
  emit(...args) {
    return super.emit(...args);
  }
  listeners(eventName) {
    return super.listeners(eventName);
  }
  // --- stdio (lazy initializers) ---
  #stdin;
  #stdout;
  #stderr;
  get stdin() {
    return this.#stdin ??= new ReadStream(0);
  }
  get stdout() {
    return this.#stdout ??= new WriteStream(1);
  }
  get stderr() {
    return this.#stderr ??= new WriteStream(2);
  }
  // --- cwd ---
  #cwd = "/";
  chdir(cwd2) {
    this.#cwd = cwd2;
  }
  cwd() {
    return this.#cwd;
  }
  // --- dummy props and getters ---
  arch = "";
  platform = "";
  argv = [];
  argv0 = "";
  execArgv = [];
  execPath = "";
  title = "";
  pid = 200;
  ppid = 100;
  get version() {
    return `v${NODE_VERSION}`;
  }
  get versions() {
    return { node: NODE_VERSION };
  }
  get allowedNodeEnvironmentFlags() {
    return /* @__PURE__ */ new Set();
  }
  get sourceMapsEnabled() {
    return false;
  }
  get debugPort() {
    return 0;
  }
  get throwDeprecation() {
    return false;
  }
  get traceDeprecation() {
    return false;
  }
  get features() {
    return {};
  }
  get release() {
    return {};
  }
  get connected() {
    return false;
  }
  get config() {
    return {};
  }
  get moduleLoadList() {
    return [];
  }
  constrainedMemory() {
    return 0;
  }
  availableMemory() {
    return 0;
  }
  uptime() {
    return 0;
  }
  resourceUsage() {
    return {};
  }
  // --- noop methods ---
  ref() {
  }
  unref() {
  }
  // --- unimplemented methods ---
  umask() {
    throw createNotImplementedError("process.umask");
  }
  getBuiltinModule() {
    return void 0;
  }
  getActiveResourcesInfo() {
    throw createNotImplementedError("process.getActiveResourcesInfo");
  }
  exit() {
    throw createNotImplementedError("process.exit");
  }
  reallyExit() {
    throw createNotImplementedError("process.reallyExit");
  }
  kill() {
    throw createNotImplementedError("process.kill");
  }
  abort() {
    throw createNotImplementedError("process.abort");
  }
  dlopen() {
    throw createNotImplementedError("process.dlopen");
  }
  setSourceMapsEnabled() {
    throw createNotImplementedError("process.setSourceMapsEnabled");
  }
  loadEnvFile() {
    throw createNotImplementedError("process.loadEnvFile");
  }
  disconnect() {
    throw createNotImplementedError("process.disconnect");
  }
  cpuUsage() {
    throw createNotImplementedError("process.cpuUsage");
  }
  setUncaughtExceptionCaptureCallback() {
    throw createNotImplementedError("process.setUncaughtExceptionCaptureCallback");
  }
  hasUncaughtExceptionCaptureCallback() {
    throw createNotImplementedError("process.hasUncaughtExceptionCaptureCallback");
  }
  initgroups() {
    throw createNotImplementedError("process.initgroups");
  }
  openStdin() {
    throw createNotImplementedError("process.openStdin");
  }
  assert() {
    throw createNotImplementedError("process.assert");
  }
  binding() {
    throw createNotImplementedError("process.binding");
  }
  // --- attached interfaces ---
  permission = { has: /* @__PURE__ */ notImplemented("process.permission.has") };
  report = {
    directory: "",
    filename: "",
    signal: "SIGUSR2",
    compact: false,
    reportOnFatalError: false,
    reportOnSignal: false,
    reportOnUncaughtException: false,
    getReport: /* @__PURE__ */ notImplemented("process.report.getReport"),
    writeReport: /* @__PURE__ */ notImplemented("process.report.writeReport")
  };
  finalization = {
    register: /* @__PURE__ */ notImplemented("process.finalization.register"),
    unregister: /* @__PURE__ */ notImplemented("process.finalization.unregister"),
    registerBeforeExit: /* @__PURE__ */ notImplemented("process.finalization.registerBeforeExit")
  };
  memoryUsage = Object.assign(() => ({
    arrayBuffers: 0,
    rss: 0,
    external: 0,
    heapTotal: 0,
    heapUsed: 0
  }), { rss: /* @__PURE__ */ __name(() => 0, "rss") });
  // --- undefined props ---
  mainModule = void 0;
  domain = void 0;
  // optional
  send = void 0;
  exitCode = void 0;
  channel = void 0;
  getegid = void 0;
  geteuid = void 0;
  getgid = void 0;
  getgroups = void 0;
  getuid = void 0;
  setegid = void 0;
  seteuid = void 0;
  setgid = void 0;
  setgroups = void 0;
  setuid = void 0;
  // internals
  _events = void 0;
  _eventsCount = void 0;
  _exiting = void 0;
  _maxListeners = void 0;
  _debugEnd = void 0;
  _debugProcess = void 0;
  _fatalException = void 0;
  _getActiveHandles = void 0;
  _getActiveRequests = void 0;
  _kill = void 0;
  _preload_modules = void 0;
  _rawDebug = void 0;
  _startProfilerIdleNotifier = void 0;
  _stopProfilerIdleNotifier = void 0;
  _tickCallback = void 0;
  _disconnect = void 0;
  _handleQueue = void 0;
  _pendingMessage = void 0;
  _channel = void 0;
  _send = void 0;
  _linkedBinding = void 0;
};

// node_modules/@cloudflare/unenv-preset/dist/runtime/node/process.mjs
var globalProcess = globalThis["process"];
var getBuiltinModule = globalProcess.getBuiltinModule;
var workerdProcess = getBuiltinModule("node:process");
var isWorkerdProcessV2 = globalThis.Cloudflare.compatibilityFlags.enable_nodejs_process_v2;
var unenvProcess = new Process({
  env: globalProcess.env,
  // `hrtime` is only available from workerd process v2
  hrtime: isWorkerdProcessV2 ? workerdProcess.hrtime : hrtime,
  // `nextTick` is available from workerd process v1
  nextTick: workerdProcess.nextTick
});
var { exit, features, platform } = workerdProcess;
var {
  // Always implemented by workerd
  env,
  // Only implemented in workerd v2
  hrtime: hrtime3,
  // Always implemented by workerd
  nextTick
} = unenvProcess;
var {
  _channel,
  _disconnect,
  _events,
  _eventsCount,
  _handleQueue,
  _maxListeners,
  _pendingMessage,
  _send,
  assert: assert2,
  disconnect,
  mainModule
} = unenvProcess;
var {
  // @ts-expect-error `_debugEnd` is missing typings
  _debugEnd,
  // @ts-expect-error `_debugProcess` is missing typings
  _debugProcess,
  // @ts-expect-error `_exiting` is missing typings
  _exiting,
  // @ts-expect-error `_fatalException` is missing typings
  _fatalException,
  // @ts-expect-error `_getActiveHandles` is missing typings
  _getActiveHandles,
  // @ts-expect-error `_getActiveRequests` is missing typings
  _getActiveRequests,
  // @ts-expect-error `_kill` is missing typings
  _kill,
  // @ts-expect-error `_linkedBinding` is missing typings
  _linkedBinding,
  // @ts-expect-error `_preload_modules` is missing typings
  _preload_modules,
  // @ts-expect-error `_rawDebug` is missing typings
  _rawDebug,
  // @ts-expect-error `_startProfilerIdleNotifier` is missing typings
  _startProfilerIdleNotifier,
  // @ts-expect-error `_stopProfilerIdleNotifier` is missing typings
  _stopProfilerIdleNotifier,
  // @ts-expect-error `_tickCallback` is missing typings
  _tickCallback,
  abort,
  addListener,
  allowedNodeEnvironmentFlags,
  arch,
  argv,
  argv0,
  availableMemory,
  // @ts-expect-error `binding` is missing typings
  binding,
  channel,
  chdir,
  config,
  connected,
  constrainedMemory,
  cpuUsage,
  cwd,
  debugPort,
  dlopen,
  // @ts-expect-error `domain` is missing typings
  domain,
  emit,
  emitWarning,
  eventNames,
  execArgv,
  execPath,
  exitCode,
  finalization,
  getActiveResourcesInfo,
  getegid,
  geteuid,
  getgid,
  getgroups,
  getMaxListeners,
  getuid,
  hasUncaughtExceptionCaptureCallback,
  // @ts-expect-error `initgroups` is missing typings
  initgroups,
  kill,
  listenerCount,
  listeners,
  loadEnvFile,
  memoryUsage,
  // @ts-expect-error `moduleLoadList` is missing typings
  moduleLoadList,
  off,
  on,
  once,
  // @ts-expect-error `openStdin` is missing typings
  openStdin,
  permission,
  pid,
  ppid,
  prependListener,
  prependOnceListener,
  rawListeners,
  // @ts-expect-error `reallyExit` is missing typings
  reallyExit,
  ref,
  release,
  removeAllListeners,
  removeListener,
  report,
  resourceUsage,
  send,
  setegid,
  seteuid,
  setgid,
  setgroups,
  setMaxListeners,
  setSourceMapsEnabled,
  setuid,
  setUncaughtExceptionCaptureCallback,
  sourceMapsEnabled,
  stderr,
  stdin,
  stdout,
  throwDeprecation,
  title,
  traceDeprecation,
  umask,
  unref,
  uptime,
  version,
  versions
} = isWorkerdProcessV2 ? workerdProcess : unenvProcess;
var _process = {
  abort,
  addListener,
  allowedNodeEnvironmentFlags,
  hasUncaughtExceptionCaptureCallback,
  setUncaughtExceptionCaptureCallback,
  loadEnvFile,
  sourceMapsEnabled,
  arch,
  argv,
  argv0,
  chdir,
  config,
  connected,
  constrainedMemory,
  availableMemory,
  cpuUsage,
  cwd,
  debugPort,
  dlopen,
  disconnect,
  emit,
  emitWarning,
  env,
  eventNames,
  execArgv,
  execPath,
  exit,
  finalization,
  features,
  getBuiltinModule,
  getActiveResourcesInfo,
  getMaxListeners,
  hrtime: hrtime3,
  kill,
  listeners,
  listenerCount,
  memoryUsage,
  nextTick,
  on,
  off,
  once,
  pid,
  platform,
  ppid,
  prependListener,
  prependOnceListener,
  rawListeners,
  release,
  removeAllListeners,
  removeListener,
  report,
  resourceUsage,
  setMaxListeners,
  setSourceMapsEnabled,
  stderr,
  stdin,
  stdout,
  title,
  throwDeprecation,
  traceDeprecation,
  umask,
  uptime,
  version,
  versions,
  // @ts-expect-error old API
  domain,
  initgroups,
  moduleLoadList,
  reallyExit,
  openStdin,
  assert: assert2,
  binding,
  send,
  exitCode,
  channel,
  getegid,
  geteuid,
  getgid,
  getgroups,
  getuid,
  setegid,
  seteuid,
  setgid,
  setgroups,
  setuid,
  permission,
  mainModule,
  _events,
  _eventsCount,
  _exiting,
  _maxListeners,
  _debugEnd,
  _debugProcess,
  _fatalException,
  _getActiveHandles,
  _getActiveRequests,
  _kill,
  _preload_modules,
  _rawDebug,
  _startProfilerIdleNotifier,
  _stopProfilerIdleNotifier,
  _tickCallback,
  _disconnect,
  _handleQueue,
  _pendingMessage,
  _channel,
  _send,
  _linkedBinding
};
var process_default = _process;

// node_modules/wrangler/_virtual_unenv_global_polyfill-@cloudflare-unenv-preset-node-process
globalThis.process = process_default;

// src/durable-objects/progress-socket.js
import { DurableObject } from "cloudflare:workers";

// src/types/websocket-messages.ts
var WebSocketCloseCodes = {
  /** Normal closure; session completed successfully */
  NORMAL_CLOSURE: 1e3,
  /** Going away (e.g., server shutting down, client navigating away) */
  GOING_AWAY: 1001,
  /** Protocol error (malformed message, invalid handshake) */
  PROTOCOL_ERROR: 1002,
  /** Policy violation (auth failure, invalid token, rate limit) */
  POLICY_VIOLATION: 1008,
  /** Message too large (exceeds 32 MiB Cloudflare limit) */
  MESSAGE_TOO_BIG: 1009,
  /** Internal server error (unhandled exception, DO failure) */
  INTERNAL_ERROR: 1011,
  /** Service restart (deployment, DO eviction, maintenance) */
  SERVICE_RESTART: 1012,
  /** Try again later (temporary overload, resource exhaustion) */
  TRY_AGAIN_LATER: 1013
};

// src/middleware/cors.js
var ALLOWED_ORIGINS = [
  "https://bookstrack.app",
  // Production domain (when deployed)
  "https://www.bookstrack.app",
  // Production with www
  "http://localhost:3000",
  // Local web development
  "http://localhost:8080",
  // Alternative local port
  "capacitor://localhost",
  // iOS Capacitor (if using Capacitor bridge)
  "ionic://localhost"
  // iOS Ionic (if using Ionic framework)
];
function getCorsHeaders(request) {
  if (!request || !request.headers) {
    return {
      "Access-Control-Allow-Origin": "*",
      // Permissive fallback for non-browser clients
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-AI-Provider",
      "Access-Control-Max-Age": "86400"
      // 24 hours preflight cache
    };
  }
  const origin = request.headers.get("Origin");
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : null;
  if (origin && !allowedOrigin) {
    console.warn(`[CORS] Blocked request from unauthorized origin: ${origin}`);
  }
  return {
    "Access-Control-Allow-Origin": allowedOrigin || "*",
    // Fallback to permissive for iOS app (no Origin header)
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-AI-Provider",
    "Access-Control-Max-Age": "86400"
    // 24 hours preflight cache
  };
}
__name(getCorsHeaders, "getCorsHeaders");

// src/utils/csv-validator.js
var MAX_ROWS = 1e4;
var SAMPLE_VALIDATION_ROWS = 10;
function countColumns(line) {
  let count3 = 1;
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        i++;
        continue;
      }
      inQuotes = !inQuotes;
    }
    if (char === "," && !inQuotes) {
      count3++;
    }
  }
  return count3;
}
__name(countColumns, "countColumns");
function validateCSV(csvText) {
  if (!csvText || csvText.trim().length === 0) {
    return {
      valid: false,
      error: "CSV file is empty"
    };
  }
  const lines = csvText.split("\n").filter((line) => line.trim());
  if (lines.length < 2) {
    return {
      valid: false,
      error: "CSV must have at least a header and one data row"
    };
  }
  if (lines.length > MAX_ROWS + 1) {
    return {
      valid: false,
      error: `CSV exceeds maximum of ${MAX_ROWS} rows`
    };
  }
  const header = lines[0];
  const columnCount = countColumns(header);
  if (columnCount < 2) {
    return {
      valid: false,
      error: "CSV must have at least 2 columns"
    };
  }
  let quoteCount = 0;
  for (const char of csvText) {
    if (char === '"') quoteCount++;
  }
  if (quoteCount % 2 !== 0) {
    return {
      valid: false,
      error: "CSV has unclosed quotes"
    };
  }
  const sampleSize = Math.min(SAMPLE_VALIDATION_ROWS, lines.length - 1);
  for (let i = 1; i <= sampleSize; i++) {
    const cols = countColumns(lines[i]);
    if (cols !== columnCount) {
      return {
        valid: false,
        error: `CSV has inconsistent column count (row ${i + 1})`
      };
    }
  }
  return {
    valid: true,
    rowCount: lines.length - 1,
    // Exclude header
    columnCount
  };
}
__name(validateCSV, "validateCSV");

// src/prompts/csv-parser-prompt.js
var PROMPT_VERSION = "v1";
function buildCSVParserPrompt() {
  return `You are a book data parser. Parse this CSV file and return a JSON array of books.

INPUT FORMAT: The CSV may be from Goodreads, LibraryThing, or StoryGraph.
Common columns: Title, Author, ISBN, ISBN13, Publisher, Year Published, Date Read, My Rating, Bookshelves, etc.
Some CSVs might contain columns with external identifiers like 'Book Id' (Goodreads), or URLs containing OpenLibrary IDs.

Map common header variations:
- "Book Title" OR "Title" \u2192 "title"
- "Author Name" OR "Author" \u2192 "author"
- "ISBN" OR "ISBN13" \u2192 "isbn"
- "My Rating" OR "Rating" \u2192 "userRating"
- "Exclusive Shelf" OR "Read Status" \u2192 "readingStatus"
- "Book Id" (Goodreads) -> "goodreadsId"

FEW-SHOT EXAMPLES:

Example 1 (Goodreads with ISBN):
CSV Row: Title,Author,ISBN13,My Rating,Exclusive Shelf,Date Read
         The Great Gatsby,F. Scott Fitzgerald,9780743273565,4,read,2024-03-15

JSON Output:
{
  "title": "The Great Gatsby",
  "author": "F. Scott Fitzgerald",
  "isbn": "9780743273565",
  "userRating": 4,
  "readingStatus": "read",
  "dateRead": "2024-03-15",
  "authorGender": "male",
  "authorCulturalRegion": "northAmerica",
  "genre": "fiction",
  "languageCode": "en"
}

Example 2 (LibraryThing without ISBN, but has OpenLibrary ID in a URL):
CSV Row: Book Title,Author Name,Rating,Tags,Notes
         Beloved,Toni Morrison,5,american-literature;historical,"From OpenLibrary: https://openlibrary.org/works/OL45804W"

JSON Output:
{
  "title": "Beloved",
  "author": "Toni Morrison",
  "isbn": null,
  "openLibraryId": "OL45804W",
  "userRating": 5,
  "shelves": ["american-literature", "historical"],
  "authorGender": "female",
  "authorCulturalRegion": "northAmerica",
  "genre": "fiction",
  "languageCode": "en"
}

Example 3 (Goodreads without ISBN, but with Book Id):
CSV Row: Title,Author,Exclusive Shelf,Book Id
         Infinite Jest,David Foster Wallace,dnf,17163

JSON Output:
{
  "title": "Infinite Jest",
  "author": "David Foster Wallace",
  "readingStatus": "dnf",
  "isbn": null,
  "goodreadsId": "17163",
  "authorGender": "male",
  "authorCulturalRegion": "northAmerica",
  "genre": "fiction",
  "languageCode": "en"
}

OUTPUT SCHEMA: Return ONLY a valid JSON array with this structure:
[
  {
    "title": string,
    "author": string,
    "isbn": string | null,
    "openLibraryId": string | null,
    "googleBooksId": string | null,
    "goodreadsId": string | null,
    "publishedYear": number | null,
    "publisher": string | null,
    "pageCount": number | null,
    "userRating": number (0-5) | null,
    "readingStatus": "read" | "reading" | "to-read" | "wishlist" | "dnf" | null,
    "dateRead": string (YYYY-MM-DD) | null,
    "shelves": string[] | null,
    "authorGender": "male" | "female" | "nonBinary" | "unknown",
    "authorCulturalRegion": "africa" | "asia" | "europe" | "northAmerica" | "southAmerica" | "oceania" | "middleEast" | "unknown",
    "genre": string | null,
    "languageCode": string | null
  }
]

RULES:
1.  PRIORITIZE ISBN: If ISBN13 exists, use it for the 'isbn' field. If not, use ISBN10.
2.  ALTERNATIVE IDs: If no ISBN is present, look for other identifiers:
    -   Look for Goodreads Book Ids in a "Book Id" column and map to "goodreadsId".
    -   Look for OpenLibrary work IDs (e.g., 'OL...W') in any column, often in URLs, and map to "openLibraryId".
    -   Look for Google Books Volume IDs (e.g., 'zyTCAlFPStIC') in any column and map to "googleBooksId".
3.  Set 'isbn' and other ID fields to null if not found.
4.  Normalize reading status to one of: "read", "reading", "to-read", "wishlist", "dnf"
5.  Extract numeric rating (0-5 scale)
6.  Parse date strings to ISO 8601 format (YYYY-MM-DD)
7.  Infer authorGender from name (male/female/nonBinary/unknown) - if uncertain, use "unknown"
8.  Infer authorCulturalRegion from author name/publisher context - if uncertain, use "unknown"
9.  Classify genre into one of: fiction, non-fiction, sci-fi, fantasy, mystery, romance, thriller, biography, history, self-help, poetry. If unsure, set to null.
10. Detect language from title/publisher (ISO 639-1 code)
11. If a field is missing or unclear, set to null
12. If a row is malformed or empty, skip it and continue processing
13. Do NOT include any text outside the JSON array

IMPORTANT: Cultural inference (authorGender, authorCulturalRegion) is AI-generated and may be inaccurate. When uncertain, prefer "unknown" over guessing.`;
}
__name(buildCSVParserPrompt, "buildCSVParserPrompt");

// src/utils/normalization.ts
function normalizeTitle(title2) {
  return title2.toLowerCase().trim().replace(/^(the|a|an)\s+/, "").replace(/[^a-z0-9\s]/g, "");
}
__name(normalizeTitle, "normalizeTitle");
function normalizeISBN(isbn) {
  return isbn.trim().replace(/[-\s]/g, "").toUpperCase();
}
__name(normalizeISBN, "normalizeISBN");
function normalizeAuthor(author) {
  return author.toLowerCase().trim();
}
__name(normalizeAuthor, "normalizeAuthor");
function normalizeImageURL(url) {
  try {
    const parsed = new URL(url.trim());
    parsed.search = "";
    parsed.protocol = "https:";
    return parsed.toString();
  } catch {
    return url.trim();
  }
}
__name(normalizeImageURL, "normalizeImageURL");

// src/utils/cache-keys.js
async function sha256(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(sha256, "sha256");
async function generateCSVCacheKey(csvText, promptVersion) {
  const hash = await sha256(csvText);
  return `csv-parse:${hash}:${promptVersion}`;
}
__name(generateCSVCacheKey, "generateCSVCacheKey");

// src/types/gemini-schemas.js
var BOOKSHELF_RESPONSE_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "Book title extracted from spine"
      },
      author: {
        type: "string",
        description: "Author name if visible on spine",
        nullable: true
      },
      isbn: {
        type: "string",
        description: "ISBN-10 or ISBN-13 if visible",
        nullable: true
      },
      format: {
        type: "string",
        enum: ["hardcover", "paperback", "mass-market", "unknown"],
        description: "Physical format detected from visual cues",
        nullable: true
      },
      confidence: {
        type: "number",
        description: "Detection confidence level (0.0-1.0)",
        minimum: 0,
        maximum: 1,
        nullable: true
      }
    },
    required: ["title"]
  }
};
var CSV_BOOK_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "Book title (required)"
      },
      author: {
        type: "string",
        description: "Author name (required)"
      },
      isbn: {
        type: "string",
        description: "ISBN-10 or ISBN-13",
        nullable: true
      },
      publicationYear: {
        type: "integer",
        description: "Year of publication",
        nullable: true
      },
      publisher: {
        type: "string",
        description: "Publisher name",
        nullable: true
      },
      pageCount: {
        type: "integer",
        description: "Number of pages",
        nullable: true,
        minimum: 1
      },
      genre: {
        type: "string",
        description: "Primary genre or subject",
        nullable: true
      },
      rating: {
        type: "number",
        description: "User rating (0-5 scale)",
        nullable: true,
        minimum: 0,
        maximum: 5
      },
      dateRead: {
        type: "string",
        description: "Date finished reading (YYYY-MM-DD format)",
        nullable: true
      },
      notes: {
        type: "string",
        description: "User notes or review",
        nullable: true
      }
    },
    required: ["title", "author"]
  }
};

// src/providers/gemini-csv-provider.js
var GEMINI_API_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent";
function sanitizeCSVForPrompt(csvText) {
  const MAX_CSV_SIZE = 500 * 1024;
  if (csvText.length > MAX_CSV_SIZE) {
    throw new Error(
      `CSV too large for processing (max ${MAX_CSV_SIZE / 1024}KB)`
    );
  }
  let sanitized = csvText.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  sanitized = sanitized.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\${/g, "\\${");
  const suspiciousPatterns = [
    /ignore\s+(previous|all|prior)\s+instructions?/gi,
    /new\s+instructions?:/gi,
    /system\s*:/gi,
    /override\s+(instructions?|system)/gi,
    /disregard\s+(previous|prior|all)/gi
  ];
  for (const pattern of suspiciousPatterns) {
    sanitized = sanitized.replace(pattern, "[REMOVED_SUSPICIOUS_CONTENT]");
  }
  return sanitized;
}
__name(sanitizeCSVForPrompt, "sanitizeCSVForPrompt");
async function parseCSVWithGemini(csvText, prompt, apiKey) {
  const sanitizedCSV = sanitizeCSVForPrompt(csvText);
  const fullPrompt = `${prompt}

CSV Data:
${sanitizedCSV}`;
  const response = await fetch(GEMINI_API_ENDPOINT, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      // System instruction: Define the CSV parser's role
      system_instruction: {
        parts: [
          {
            text: `You are an expert book data parser specialized in extracting structured book information from CSV exports.

Your primary task is to intelligently map CSV columns to a standardized book data schema, handling various CSV formats from Goodreads, LibraryThing, StoryGraph, and custom exports.

Core capabilities:
- Auto-detect column headers regardless of format variations
- Infer missing metadata (author gender, cultural region, genre) when possible
- Normalize data types and formats (dates, ratings, ISBN formats)
- Handle malformed or incomplete rows gracefully

Always return ONLY a valid JSON array. Do not include explanatory text.`
          }
        ]
      },
      contents: [
        {
          parts: [
            {
              text: fullPrompt
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.1,
        // Maximum determinism for structured parsing with Flash-Lite
        topP: 0.95,
        // Nucleus sampling for quality
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
        // Force JSON output (eliminates markdown code blocks)
        responseSchema: CSV_BOOK_SCHEMA,
        // Schema-enforced validation (guarantees title+author)
        stopSequences: ["\n\n\n"]
        // Stop on triple newline (prevents unnecessary continuation)
      }
    })
  });
  if (!response.ok) {
    const error3 = await response.text();
    throw new Error(`Gemini API error: ${error3}`);
  }
  const data = await response.json();
  const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
  const tokenUsage = data.usageMetadata || {};
  const promptTokens = tokenUsage.promptTokenCount || 0;
  const outputTokens = tokenUsage.candidatesTokenCount || 0;
  const totalTokens = tokenUsage.totalTokenCount || 0;
  console.log(
    `[GeminiCSVProvider] Token usage - Prompt: ${promptTokens}, Output: ${outputTokens}, Total: ${totalTokens}`
  );
  if (!textResponse) {
    throw new Error("Gemini returned empty response");
  }
  try {
    const parsed = JSON.parse(textResponse);
    if (!Array.isArray(parsed)) {
      throw new Error("Schema violation: Expected array, got " + typeof parsed);
    }
    return parsed;
  } catch (error3) {
    throw new Error(`Invalid JSON from Gemini: ${error3.message}`);
  }
}
__name(parseCSVWithGemini, "parseCSVWithGemini");

// src/utils/response-builder.ts
var ErrorCodes = {
  // Request validation errors (4xx)
  MISSING_PARAMETER: "MISSING_PARAMETER",
  INVALID_REQUEST: "INVALID_REQUEST",
  INVALID_ISBN: "INVALID_ISBN",
  INVALID_QUERY: "INVALID_QUERY",
  INVALID_FILE: "INVALID_FILE",
  FILE_TOO_LARGE: "FILE_TOO_LARGE",
  BATCH_TOO_LARGE: "BATCH_TOO_LARGE",
  EMPTY_BATCH: "EMPTY_BATCH",
  // Resource errors (4xx)
  NOT_FOUND: "NOT_FOUND",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  CLIENT_DISCONNECTED: "CLIENT_DISCONNECTED",
  // External service errors (5xx or 4xx)
  RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
  PROVIDER_ERROR: "PROVIDER_ERROR",
  PROVIDER_TIMEOUT: "PROVIDER_TIMEOUT",
  CACHE_ERROR: "CACHE_ERROR",
  // Internal errors (5xx)
  INTERNAL_ERROR: "INTERNAL_ERROR"
};
function createSuccessResponse(data, metadata = {}, status = 200, corsRequest = null) {
  const envelope = {
    data,
    metadata: {
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      ...metadata
    }
  };
  return new Response(JSON.stringify(envelope), {
    status,
    headers: {
      ...getCorsHeaders(corsRequest),
      "Content-Type": "application/json",
      "X-Response-Format": "v2.0"
      // For monitoring compliance (Issue #93)
    }
  });
}
__name(createSuccessResponse, "createSuccessResponse");
function createErrorResponse(message, status = 500, code, details, corsRequest = null) {
  console.error(`Error [${code || "UNKNOWN"}]:`, message);
  const envelope = {
    data: null,
    metadata: {
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    },
    error: {
      message,
      code,
      details
    }
  };
  return new Response(JSON.stringify(envelope), {
    status,
    headers: {
      ...getCorsHeaders(corsRequest),
      "Content-Type": "application/json",
      "X-Response-Format": "v2.0",
      // For monitoring compliance (Issue #93)
      "X-Error-Type": code || "UNKNOWN"
      // For analytics tracking
    }
  });
}
__name(createErrorResponse, "createErrorResponse");
function jsonResponse(data, status = 200, corsRequest = null, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...getCorsHeaders(corsRequest),
      "Content-Type": "application/json",
      ...extraHeaders
    }
  });
}
__name(jsonResponse, "jsonResponse");
function errorResponse(code, message, status = 400, corsRequest = null, extraHeaders = {}) {
  const headersWithErrorCode = {
    "X-Error-Type": code,
    ...extraHeaders
  };
  return jsonResponse(
    {
      success: false,
      error: {
        code,
        message
      }
    },
    status,
    corsRequest,
    headersWithErrorCode
  );
}
__name(errorResponse, "errorResponse");
function acceptedResponse(data, corsRequest = null) {
  return jsonResponse(data, 202, corsRequest);
}
__name(acceptedResponse, "acceptedResponse");
function notFoundResponse(message = "Resource not found", corsRequest = null) {
  return errorResponse("NOT_FOUND", message, 404, corsRequest);
}
__name(notFoundResponse, "notFoundResponse");

// src/handlers/csv-import.ts
var MAX_FILE_SIZE = 10 * 1024 * 1024;
async function handleCSVImport(request, env2, ctx) {
  try {
    const formData = await request.formData();
    const csvFile = formData.get("file");
    if (!csvFile) {
      return createErrorResponse(
        "No file provided",
        400,
        ErrorCodes.MISSING_PARAMETER
      );
    }
    if (csvFile.size > MAX_FILE_SIZE) {
      return createErrorResponse(
        "CSV file too large (max 10MB)",
        413,
        ErrorCodes.FILE_TOO_LARGE,
        {
          suggestion: "Try splitting your CSV into smaller files or removing unnecessary columns"
        }
      );
    }
    const jobId = crypto.randomUUID();
    const authToken = crypto.randomUUID();
    const useRefactoredDOs = env2.ENABLE_REFACTORED_DOS === "true";
    if (useRefactoredDOs) {
      const wsDoId = env2.WEBSOCKET_CONNECTION_DO.idFromName(jobId);
      const wsDoStub = env2.WEBSOCKET_CONNECTION_DO.get(wsDoId);
      const stateDoId = env2.JOB_STATE_MANAGER_DO.idFromName(jobId);
      const stateDoStub = env2.JOB_STATE_MANAGER_DO.get(stateDoId);
      await wsDoStub.setAuthToken(authToken);
      await stateDoStub.initializeJobState(jobId, "csv_import", 0);
      console.log(`[CSV Import] Using new architecture for job ${jobId}`);
      const csvText = await csvFile.text();
      await stateDoStub.scheduleCSVProcessing(csvText, jobId);
    } else {
      const doId = env2.PROGRESS_WEBSOCKET_DO.idFromName(jobId);
      const doStub = env2.PROGRESS_WEBSOCKET_DO.get(doId);
      await doStub.setAuthToken(authToken);
      console.log(`[CSV Import] Auth token generated for job ${jobId}`);
      await doStub.initializeJobState("csv_import", 0);
      const csvText = await csvFile.text();
      await doStub.scheduleCSVProcessing(csvText, jobId);
      console.log(`[CSV Import] Using legacy architecture for job ${jobId}`);
    }
    const initResponse = {
      jobId,
      token: authToken
      // WebSocket authentication token
    };
    return createSuccessResponse(initResponse, {}, 202);
  } catch (error3) {
    return createErrorResponse(error3.message, 500, ErrorCodes.INTERNAL_ERROR);
  }
}
__name(handleCSVImport, "handleCSVImport");
async function processCSVImportCore(csvText, jobId, doStub, env2) {
  const startTime = Date.now();
  try {
    await new Promise((resolve) => setTimeout(resolve, 200));
    console.log(
      `[CSV Import] Waiting for WebSocket ready signal for job ${jobId}`
    );
    const readyResult = await doStub.waitForReady(1e4);
    if (readyResult.timedOut || readyResult.disconnected) {
      const reason = readyResult.timedOut ? "timeout" : "WebSocket not connected";
      console.warn(
        `[CSV Import] WebSocket ready ${reason} for job ${jobId}, proceeding anyway (client may miss early updates)`
      );
    } else {
      console.log(
        `[CSV Import] \u2705 WebSocket ready for job ${jobId}, starting processing`
      );
    }
    await doStub.updateProgress("csv_import", {
      progress: 0.02,
      status: "Validating CSV file...",
      processedCount: 0
    });
    const validation = validateCSV(csvText);
    if (!validation.valid) {
      throw new Error(`Invalid CSV: ${validation.error}`);
    }
    await doStub.updateProgress("csv_import", {
      progress: 0.05,
      status: "Uploading CSV to Gemini...",
      processedCount: 0
    });
    const cacheKey = await generateCSVCacheKey(csvText, PROMPT_VERSION);
    let parsedBooks = await env2.KV_CACHE.get(cacheKey, "json");
    if (!parsedBooks) {
      const prompt = buildCSVParserPrompt();
      parsedBooks = await callGemini(csvText, prompt, env2);
      if (!Array.isArray(parsedBooks) || parsedBooks.length === 0) {
        throw new Error("No valid books found in CSV");
      }
      await env2.KV_CACHE.put(cacheKey, JSON.stringify(parsedBooks), {
        expirationTtl: 604800
      });
    }
    await doStub.updateProgress("csv_import", {
      progress: 0.75,
      status: `Gemini parsed ${parsedBooks.length} books with valid title+author`,
      processedCount: parsedBooks.length
    });
    const validatedBooks = parsedBooks.filter((book) => book.title && book.author).map((book) => ({
      title: String(book.title).trim(),
      author: String(book.author).trim(),
      isbn: book.isbn ? String(book.isbn).trim() : void 0
    }));
    const resourceId = `job-results:${jobId}`;
    await env2.KV_CACHE.put(
      resourceId,
      JSON.stringify({ books: validatedBooks, errors: [] }),
      { expirationTtl: 3600 }
      // 1 hour
    );
    await doStub.complete("csv_import", {
      summary: {
        totalProcessed: parsedBooks.length,
        successCount: validatedBooks.length,
        failureCount: parsedBooks.length - validatedBooks.length,
        duration: Date.now() - startTime,
        resourceId
      }
    });
  } catch (error3) {
    await doStub.sendError("csv_import", {
      code: "E_CSV_PROCESSING_FAILED",
      message: error3.message,
      retryable: true,
      details: {
        fallbackAvailable: true,
        suggestion: "Try manual CSV import instead"
      }
    });
  }
}
__name(processCSVImportCore, "processCSVImportCore");
async function callGemini(csvText, prompt, env2) {
  const apiKey = env2.GEMINI_API_KEY?.get ? await env2.GEMINI_API_KEY.get() : env2.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not configured");
  }
  return await parseCSVWithGemini(csvText, prompt, apiKey);
}
__name(callGemini, "callGemini");

// src/services/genre-normalizer.ts
var CANONICAL_GENRES = {
  // Fiction categories
  "Science Fiction": ["Sci-Fi", "Science Fiction", "SF", "Scifi"],
  Fantasy: ["Fantasy", "Fantasie"],
  Mystery: ["Mystery", "Detective", "Whodunit", "Mystrey"],
  Thriller: ["Thriller", "Suspense"],
  Romance: ["Romance", "Love Story"],
  Horror: ["Horror", "Scary"],
  "Literary Fiction": ["Literary", "Literature", "Literary Fiction"],
  "Historical Fiction": ["Historical Fiction", "Historical Novel"],
  // Non-fiction categories
  Biography: ["Biography", "Memoir", "Autobiography"],
  History: ["History", "Historical"],
  Science: ["Science", "Popular Science"],
  Philosophy: ["Philosophy", "Philosophical"],
  "Self-Help": ["Self-Help", "Self Improvement", "Personal Development"],
  Business: ["Business", "Economics", "Entrepreneurship"],
  "True Crime": ["True Crime", "Crime"],
  // Age groups
  "Young Adult": ["Young Adult", "YA", "Teen"],
  "Children's": ["Children's", "Kids", "Juvenile"],
  "Middle Grade": ["Middle Grade", "MG"],
  // Special categories
  Classics: ["Classic", "Classics", "Classical"],
  Contemporary: ["Contemporary", "Modern"],
  "Graphic Novels": ["Graphic Novel", "Comics", "Manga"],
  Poetry: ["Poetry", "Poems", "Verse"],
  Dystopian: ["Dystopian", "Dystopia"],
  Fiction: ["Fiction"]
};
var PROVIDER_MAPPINGS = {
  // Google Books hierarchical format
  "Fiction / Science Fiction / General": ["Science Fiction", "Fiction"],
  "Fiction / Science Fiction / Dystopian": [
    "Science Fiction",
    "Dystopian",
    "Fiction"
  ],
  "Fiction / Fantasy / General": ["Fantasy", "Fiction"],
  "Fiction / Fantasy / Epic": ["Fantasy", "Fiction"],
  "Fiction / Mystery & Detective / General": ["Mystery", "Fiction"],
  "Fiction / Thrillers / General": ["Thriller", "Fiction"],
  "Fiction / Romance / General": ["Romance", "Fiction"],
  "Fiction / Horror": ["Horror", "Fiction"],
  "Fiction / Literary": ["Literary Fiction", "Fiction"],
  "Fiction / Historical / General": ["Historical Fiction", "Fiction"],
  // ISBNDB uses "&" separators
  "Science Fiction & Fantasy": ["Science Fiction", "Fantasy"],
  "Mystery & Thriller": ["Mystery", "Thriller"],
  "Romance & Fiction": ["Romance", "Fiction"],
  // OpenLibrary descriptive subjects
  "Dystopian fiction": ["Dystopian", "Science Fiction"],
  "Science fiction": ["Science Fiction"],
  "Classic Literature": ["Classics", "Literary Fiction"],
  "Fantasy fiction": ["Fantasy"],
  "Detective and mystery stories": ["Mystery"],
  // Gemini AI free-form genres
  "Sci-fi dystopia": ["Science Fiction", "Dystopian"],
  "Post-apocalyptic fiction": ["Science Fiction", "Dystopian"],
  "Epic fantasy": ["Fantasy"]
};
function levenshteinDistance(a, b) {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}
__name(levenshteinDistance, "levenshteinDistance");
var GenreNormalizer = class {
  static {
    __name(this, "GenreNormalizer");
  }
  fuzzyThreshold = 0.85;
  /**
   * Normalize raw genres from any provider to canonical subjectTags
   * @param rawGenres - Raw genre strings from provider
   * @param provider - Provider name ('google-books', 'openlibrary', etc.)
   * @returns Array of canonical genre tags (sorted, deduplicated)
   */
  normalize(rawGenres, provider) {
    const normalized = /* @__PURE__ */ new Set();
    for (const raw2 of rawGenres) {
      const cleaned = this.preprocess(raw2, provider);
      const exactMatch = PROVIDER_MAPPINGS[cleaned];
      if (exactMatch) {
        exactMatch.forEach((tag) => normalized.add(tag));
        continue;
      }
      const canonicalMatch = this.findCanonicalMatch(cleaned);
      if (canonicalMatch) {
        normalized.add(canonicalMatch);
        continue;
      }
      const fuzzyMatch = this.findFuzzyMatch(cleaned);
      if (fuzzyMatch) {
        normalized.add(fuzzyMatch);
      } else {
        normalized.add(cleaned);
      }
    }
    return Array.from(normalized).sort();
  }
  /**
   * Provider-specific preprocessing
   * - Google Books: Attempts exact match for hierarchical genres (e.g., "Fiction / Science Fiction / General") via PROVIDER_MAPPINGS, falls back to fuzzy matching
   * - OpenLibrary: Lowercase normalization, trim
   * - ISBNDB: Split "&" separators
   */
  preprocess(raw2, provider) {
    let cleaned = raw2.trim();
    if (provider === "google-books") {
      return cleaned;
    }
    if (provider === "isbndb") {
      return cleaned;
    }
    if (provider === "openlibrary") {
      return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
    }
    return cleaned;
  }
  /**
   * Find canonical genre by checking all variations
   */
  findCanonicalMatch(genre) {
    const lowerGenre = genre.toLowerCase();
    for (const [canonical, variations] of Object.entries(CANONICAL_GENRES)) {
      if (variations.some((v) => v.toLowerCase() === lowerGenre)) {
        return canonical;
      }
    }
    return null;
  }
  /**
   * Find fuzzy match using Levenshtein distance
   * Returns canonical genre if similarity > threshold (85%)
   */
  findFuzzyMatch(genre) {
    const lowerGenre = genre.toLowerCase();
    let bestMatch = null;
    let bestSimilarity = 0;
    for (const canonical of Object.keys(CANONICAL_GENRES)) {
      const distance = levenshteinDistance(lowerGenre, canonical.toLowerCase());
      const maxLen = Math.max(lowerGenre.length, canonical.length);
      const similarity = 1 - distance / maxLen;
      if (similarity > bestSimilarity && similarity >= this.fuzzyThreshold) {
        bestMatch = canonical;
        bestSimilarity = similarity;
      }
    }
    return bestMatch;
  }
};

// src/utils/book-metadata.js
var PLACEHOLDER_COVER = "https://placehold.co/300x450/e0e0e0/666666?text=No+Cover";
async function generateUrlHash(url) {
  const encoder = new TextEncoder();
  const data = encoder.encode(url);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = new Uint8Array(hashBuffer);
  const hashHex = Array.from(hashArray).map((b) => b.toString(16).padStart(2, "0")).join("");
  return hashHex.substring(0, 32);
}
__name(generateUrlHash, "generateUrlHash");
async function detectImageQuality(coverUrl, env2) {
  if (!coverUrl) {
    return { quality: "missing", width: 0, height: 0 };
  }
  const urlHash = await generateUrlHash(coverUrl);
  const cacheKey = `image-dims:${urlHash}`;
  try {
    const cached = await env2.KV_CACHE.get(cacheKey, "json");
    if (cached && cached.width && cached.height) {
      return {
        quality: classifyQuality(cached.width),
        width: cached.width,
        height: cached.height,
        cached: true
      };
    }
  } catch (error3) {
    console.warn("KV cache read failed for image dimensions:", error3);
  }
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2e3);
    const response = await fetch(coverUrl, {
      method: "HEAD",
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (!response.ok) {
      throw new Error(`HEAD request failed: ${response.status}`);
    }
    const contentType = response.headers.get("content-type");
    if (!contentType?.startsWith("image/")) {
      throw new Error("Not an image response");
    }
    const dimensions = await extractDimensionsFromResponse(response, coverUrl);
    if (dimensions.width > 0) {
      try {
        await env2.KV_CACHE.put(cacheKey, JSON.stringify(dimensions), {
          expirationTtl: 86400
          // 24 hours
        });
      } catch (error3) {
        console.warn("KV cache write failed for image dimensions:", error3);
      }
      return {
        quality: classifyQuality(dimensions.width),
        ...dimensions,
        cached: false
      };
    }
  } catch (error3) {
    console.warn(`HEAD request failed for ${coverUrl}:`, error3.message);
  }
  const heuristicDimensions = inferDimensionsFromUrl(coverUrl);
  return {
    quality: classifyQuality(heuristicDimensions.width),
    ...heuristicDimensions,
    fallback: true
  };
}
__name(detectImageQuality, "detectImageQuality");
async function extractDimensionsFromResponse(response, url) {
  return inferDimensionsFromUrl(url);
}
__name(extractDimensionsFromResponse, "extractDimensionsFromResponse");
function inferDimensionsFromUrl(url) {
  if (url.includes("zoom=1") || url.includes("zoom=2")) {
    return { width: 800, height: 1200 };
  } else if (url.includes("zoom=0")) {
    return { width: 128, height: 192 };
  }
  if (url.includes("-L.jpg")) {
    return { width: 800, height: 1200 };
  } else if (url.includes("-M.jpg")) {
    return { width: 400, height: 600 };
  } else if (url.includes("-S.jpg")) {
    return { width: 200, height: 300 };
  }
  if (url.includes("isbndb.com")) {
    return { width: 500, height: 750 };
  }
  return { width: 400, height: 600 };
}
__name(inferDimensionsFromUrl, "inferDimensionsFromUrl");
function classifyQuality(width) {
  if (width === 0) return "missing";
  if (width > 800) return "high";
  if (width >= 400) return "medium";
  return "low";
}
__name(classifyQuality, "classifyQuality");
function generateSearchLinks(isbn, title2, author, volumeId = null) {
  const links = {};
  if (volumeId) {
    links.googleBooks = `https://www.google.com/books/edition/_/${volumeId}`;
  } else if (isbn) {
    links.googleBooks = `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`;
  } else if (title2) {
    const query = author ? `${title2} ${author}` : title2;
    links.googleBooks = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}`;
  }
  if (isbn) {
    links.openLibrary = `https://openlibrary.org/isbn/${isbn}`;
  } else if (title2) {
    links.openLibrary = `https://openlibrary.org/search?q=${encodeURIComponent(title2)}`;
  }
  if (isbn) {
    links.amazon = `https://www.amazon.com/s?k=${isbn}`;
  } else if (title2 && author) {
    links.amazon = `https://www.amazon.com/s?k=${encodeURIComponent(title2 + " " + author)}`;
  } else if (title2) {
    links.amazon = `https://www.amazon.com/s?k=${encodeURIComponent(title2)}`;
  }
  return links;
}
__name(generateSearchLinks, "generateSearchLinks");
function getPlaceholderCover() {
  return PLACEHOLDER_COVER;
}
__name(getPlaceholderCover, "getPlaceholderCover");

// src/services/normalizers/google-books.ts
var genreNormalizer = new GenreNormalizer();
function extractYear(dateString) {
  if (!dateString) return void 0;
  const match2 = dateString.match(/^(\d{4})/);
  return match2 ? parseInt(match2[1], 10) : void 0;
}
__name(extractYear, "extractYear");
function getHighResCoverURL(imageLinks) {
  const thumbnailURL = imageLinks?.thumbnail?.replace("http:", "https:");
  if (!thumbnailURL) return getPlaceholderCover();
  return thumbnailURL.replace(/&zoom=\d/, "") + "&zoom=3";
}
__name(getHighResCoverURL, "getHighResCoverURL");
function normalizeGoogleBooksToWork(item) {
  const volumeInfo = item.volumeInfo || {};
  return {
    title: volumeInfo.title || "Unknown",
    subjectTags: genreNormalizer.normalize(
      volumeInfo.categories || [],
      "google-books"
    ),
    originalLanguage: volumeInfo.language,
    firstPublicationYear: extractYear(volumeInfo.publishedDate),
    description: volumeInfo.description,
    coverImageURL: getHighResCoverURL(volumeInfo.imageLinks),
    synthetic: false,
    primaryProvider: "google-books",
    contributors: ["google-books"],
    goodreadsWorkIDs: [],
    amazonASINs: [],
    librarythingIDs: [],
    googleBooksVolumeIDs: [item.id],
    isbndbQuality: 0,
    reviewStatus: "verified"
  };
}
__name(normalizeGoogleBooksToWork, "normalizeGoogleBooksToWork");
function normalizeGoogleBooksToEdition(item) {
  const volumeInfo = item.volumeInfo || {};
  const identifiers = volumeInfo.industryIdentifiers || [];
  const isbn13 = identifiers.find(
    (id) => id.type === "ISBN_13"
  )?.identifier;
  const isbn10 = identifiers.find(
    (id) => id.type === "ISBN_10"
  )?.identifier;
  const isbns = [isbn13, isbn10].filter(Boolean);
  return {
    isbn: isbn13 || isbn10,
    isbns,
    title: volumeInfo.title,
    publisher: volumeInfo.publisher,
    publicationDate: volumeInfo.publishedDate,
    pageCount: volumeInfo.pageCount,
    format: "Other",
    // Google Books doesn't provide format data
    coverImageURL: getHighResCoverURL(volumeInfo.imageLinks),
    editionTitle: void 0,
    editionDescription: volumeInfo.description,
    language: volumeInfo.language,
    primaryProvider: "google-books",
    contributors: ["google-books"],
    amazonASINs: [],
    googleBooksVolumeIDs: [item.id],
    librarythingIDs: [],
    isbndbQuality: 0
  };
}
__name(normalizeGoogleBooksToEdition, "normalizeGoogleBooksToEdition");

// src/services/normalizers/openlibrary.ts
var genreNormalizer2 = new GenreNormalizer();
function extractYear2(dateString) {
  if (!dateString) return void 0;
  if (typeof dateString === "number") return dateString;
  const match2 = dateString.match(/\b(\d{4})\b/);
  return match2 ? parseInt(match2[1], 10) : void 0;
}
__name(extractYear2, "extractYear");
function normalizeOpenLibraryToWork(doc) {
  return {
    title: doc.title || "Unknown",
    subjectTags: genreNormalizer2.normalize(doc.subject || [], "openlibrary"),
    originalLanguage: doc.language?.[0],
    firstPublicationYear: extractYear2(doc.first_publish_year),
    description: void 0,
    // OpenLibrary search doesn't include descriptions
    coverImageURL: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : getPlaceholderCover(),
    synthetic: false,
    primaryProvider: "openlibrary",
    contributors: ["openlibrary"],
    openLibraryWorkID: extractWorkId(doc.key),
    // Canonical field
    goodreadsWorkIDs: doc.id_goodreads || [],
    amazonASINs: doc.id_amazon || [],
    librarythingIDs: doc.id_librarything || [],
    googleBooksVolumeIDs: doc.id_google || [],
    isbndbQuality: 0,
    reviewStatus: "verified"
  };
}
__name(normalizeOpenLibraryToWork, "normalizeOpenLibraryToWork");
function normalizeOpenLibraryToEdition(doc) {
  const isbn13 = doc.isbn?.find((isbn) => isbn.length === 13);
  const isbn10 = doc.isbn?.find((isbn) => isbn.length === 10);
  const isbns = [isbn13, isbn10].filter(Boolean);
  return {
    isbn: isbn13 || isbn10,
    isbns,
    title: doc.title,
    publisher: doc.publisher?.[0],
    publicationDate: doc.publish_date?.[0],
    pageCount: doc.number_of_pages_median,
    format: inferFormat(doc),
    coverImageURL: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : getPlaceholderCover(),
    language: doc.language?.[0],
    primaryProvider: "openlibrary",
    contributors: ["openlibrary"],
    openLibraryID: extractEditionId(doc.key),
    openLibraryEditionID: extractEditionId(doc.key),
    amazonASINs: doc.id_amazon || [],
    googleBooksVolumeIDs: doc.id_google || [],
    librarythingIDs: doc.id_librarything || [],
    isbndbQuality: 0
  };
}
__name(normalizeOpenLibraryToEdition, "normalizeOpenLibraryToEdition");
function normalizeOpenLibraryToAuthor(authorName) {
  return {
    name: authorName,
    gender: "Unknown"
    // Enriched via Wikidata in enrichment service
  };
}
__name(normalizeOpenLibraryToAuthor, "normalizeOpenLibraryToAuthor");
function extractWorkId(key) {
  if (!key) return void 0;
  const match2 = key.match(/\/works\/([^\/]+)/);
  return match2 ? match2[1] : void 0;
}
__name(extractWorkId, "extractWorkId");
function extractEditionId(key) {
  if (!key) return void 0;
  const match2 = key.match(/\/books\/([^\/]+)/);
  return match2 ? match2[1] : void 0;
}
__name(extractEditionId, "extractEditionId");
function inferFormat(doc) {
  return "Paperback";
}
__name(inferFormat, "inferFormat");

// src/services/normalizers/isbndb.ts
var genreNormalizer3 = new GenreNormalizer();
function extractYear3(dateString) {
  if (!dateString) return void 0;
  const match2 = dateString.match(/^(\d{4})/);
  return match2 ? parseInt(match2[1], 10) : void 0;
}
__name(extractYear3, "extractYear");
function normalizeBinding(binding2) {
  if (!binding2) return "Paperback";
  const bindingLower = binding2.toLowerCase();
  if (bindingLower.includes("hardcover") || bindingLower.includes("hardback")) {
    return "Hardcover";
  }
  if (bindingLower.includes("paperback") || bindingLower.includes("trade paper")) {
    return "Paperback";
  }
  if (bindingLower.includes("ebook") || bindingLower.includes("kindle") || bindingLower.includes("digital")) {
    return "E-book";
  }
  if (bindingLower.includes("audio")) {
    return "Audiobook";
  }
  return "Paperback";
}
__name(normalizeBinding, "normalizeBinding");
function normalizeISBNdbToWork(book) {
  return {
    title: book.title || "Unknown",
    subjectTags: genreNormalizer3.normalize(book.subjects || [], "isbndb"),
    originalLanguage: book.language || void 0,
    firstPublicationYear: extractYear3(book.date_published),
    description: book.synopsis || void 0,
    synthetic: false,
    primaryProvider: "isbndb",
    contributors: ["isbndb"],
    isbndbID: book.isbn13 || book.isbn || void 0,
    // Fallback to ISBN-10 if ISBN-13 missing
    goodreadsWorkIDs: [],
    amazonASINs: [],
    librarythingIDs: [],
    googleBooksVolumeIDs: [],
    isbndbQuality: calculateISBNdbQuality(book),
    reviewStatus: "verified"
  };
}
__name(normalizeISBNdbToWork, "normalizeISBNdbToWork");
function normalizeISBNdbToEdition(book) {
  const isbn13 = book.isbn13;
  const isbn10 = book.isbn;
  const isbns = [isbn13, isbn10].filter(Boolean);
  return {
    isbn: isbn13 || isbn10,
    isbns,
    title: book.title,
    publisher: book.publisher,
    publicationDate: book.date_published,
    pageCount: book.pages,
    format: normalizeBinding(book.binding),
    coverImageURL: book.image || getPlaceholderCover(),
    editionTitle: book.title_long !== book.title ? book.title_long : void 0,
    editionDescription: book.synopsis,
    language: book.language,
    primaryProvider: "isbndb",
    contributors: ["isbndb"],
    isbndbID: book.isbn13 || book.isbn || void 0,
    // Fallback to ISBN-10 if ISBN-13 missing
    amazonASINs: [],
    googleBooksVolumeIDs: [],
    librarythingIDs: [],
    isbndbQuality: calculateISBNdbQuality(book)
  };
}
__name(normalizeISBNdbToEdition, "normalizeISBNdbToEdition");
function normalizeISBNdbToAuthor(authorName) {
  return {
    name: authorName,
    gender: "Unknown"
    // Enriched via Wikidata in enrichment service
  };
}
__name(normalizeISBNdbToAuthor, "normalizeISBNdbToAuthor");
function calculateISBNdbQuality(book) {
  let score = 50;
  if (book.image) score += 20;
  if (book.synopsis && book.synopsis.length > 50) score += 10;
  if (book.pages && book.pages > 0) score += 5;
  if (book.publisher) score += 5;
  if (book.subjects && book.subjects.length > 0) score += 5;
  if (book.authors && book.authors.length > 0) score += 5;
  const finalScore = Math.min(Math.max(score, 0), 100);
  return isNaN(finalScore) ? 50 : finalScore;
}
__name(calculateISBNdbQuality, "calculateISBNdbQuality");

// src/utils/analytics-logger.ts
async function logExternalApiCall(provider, apiCallFn, params, env2) {
  const startTime = Date.now();
  try {
    const result = await apiCallFn();
    const processingTime = Date.now() - startTime;
    if (env2.ANALYTICS_ENGINE) {
      const { query, isbn } = params;
      const eventType = isbn ? "isbn_search" : "search";
      const resultCount = result?.works?.length ?? 0;
      env2.ANALYTICS_ENGINE.writeDataPoint({
        blobs: [query || isbn || "unknown", eventType, provider],
        doubles: [processingTime, resultCount],
        indexes: [`${provider.toLowerCase()}-success`]
      });
    }
    return result;
  } catch (error3) {
    const processingTime = Date.now() - startTime;
    const errorMessage = error3 instanceof Error ? error3.message : String(error3);
    if (env2.ANALYTICS_ENGINE) {
      const { query, isbn } = params;
      const eventType = isbn ? "isbn_search_error" : "search_error";
      env2.ANALYTICS_ENGINE.writeDataPoint({
        blobs: [query || isbn || "unknown", eventType, provider, errorMessage],
        doubles: [processingTime, 0],
        indexes: [`${provider.toLowerCase()}-error`]
      });
    }
    throw error3;
  }
}
__name(logExternalApiCall, "logExternalApiCall");

// src/services/external-apis.ts
var GOOGLE_BOOKS_USER_AGENT = "BooksTracker/1.0 (nerd@ooheynerds.com) GoogleBooksWorker/1.0.0";
async function searchGoogleBooks(query, params = {}, env2) {
  return logExternalApiCall(
    "GoogleBooks",
    async () => {
      console.log(`GoogleBooks search for "${query}"`);
      const apiKey = env2.GOOGLE_BOOKS_API_KEY?.get ? await env2.GOOGLE_BOOKS_API_KEY.get() : env2.GOOGLE_BOOKS_API_KEY;
      if (!apiKey) {
        console.error("Google Books API key not configured.");
        return null;
      }
      const maxResults = params.maxResults || 20;
      const searchUrl = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=${maxResults}&key=${apiKey}`;
      const response = await fetch(searchUrl, {
        headers: {
          "User-Agent": GOOGLE_BOOKS_USER_AGENT,
          Accept: "application/json"
        },
        cache: "no-cache"
        // Force revalidation with Google Books API
      });
      if (!response.ok) {
        throw new Error(
          `Google Books API error: ${response.status} ${response.statusText}`
        );
      }
      const data = await response.json();
      const normalizedData = normalizeGoogleBooksResponse(data);
      if (!normalizedData.works || normalizedData.works.length === 0) {
        return null;
      }
      return normalizedData;
    },
    { query },
    env2
  );
}
__name(searchGoogleBooks, "searchGoogleBooks");
async function searchGoogleBooksByISBN(isbn, env2) {
  return logExternalApiCall(
    "GoogleBooks",
    async () => {
      console.log(`GoogleBooks ISBN search for "${isbn}"`);
      const apiKey = env2.GOOGLE_BOOKS_API_KEY?.get ? await env2.GOOGLE_BOOKS_API_KEY.get() : env2.GOOGLE_BOOKS_API_KEY;
      if (!apiKey) {
        console.error("Google Books API key not configured.");
        return null;
      }
      const searchUrl = `https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(isbn)}&key=${apiKey}`;
      const response = await fetch(searchUrl, {
        headers: {
          "User-Agent": GOOGLE_BOOKS_USER_AGENT,
          Accept: "application/json"
        },
        cache: "no-cache"
        // Force revalidation with Google Books API
      });
      if (!response.ok) {
        throw new Error(
          `Google Books API error: ${response.status} ${response.statusText}`
        );
      }
      const data = await response.json();
      const normalizedData = normalizeGoogleBooksResponse(data);
      if (!normalizedData.works || normalizedData.works.length === 0) {
        return null;
      }
      return normalizedData;
    },
    { isbn },
    env2
  );
}
__name(searchGoogleBooksByISBN, "searchGoogleBooksByISBN");
function normalizeGoogleBooksResponse(apiResponse) {
  if (!apiResponse.items || apiResponse.items.length === 0) {
    return { works: [], editions: [], authors: [] };
  }
  const works = [];
  const editions = [];
  const authorsMap = /* @__PURE__ */ new Map();
  apiResponse.items.forEach((item) => {
    const volumeInfo = item.volumeInfo;
    if (!volumeInfo || !volumeInfo.title) {
      return;
    }
    const work = normalizeGoogleBooksToWork(item);
    const edition = normalizeGoogleBooksToEdition(item);
    const authorNames = volumeInfo.authors || ["Unknown Author"];
    const authors = authorNames.map((name) => ({
      name,
      gender: "Unknown"
      // Required field per canonical contract
    }));
    work.authors = authors;
    authors.forEach((author) => {
      if (!authorsMap.has(author.name)) {
        authorsMap.set(author.name, author);
      }
    });
    works.push(work);
    editions.push(edition);
  });
  return {
    works,
    editions,
    authors: Array.from(authorsMap.values())
  };
}
__name(normalizeGoogleBooksResponse, "normalizeGoogleBooksResponse");
var OPENLIBRARY_USER_AGENT = "BooksTracker/1.0 (nerd@ooheynerds.com) OpenLibraryWorker/1.1.0";
async function searchOpenLibrary(query, params = {}, env2) {
  return logExternalApiCall(
    "OpenLibrary",
    async () => {
      console.log(`OpenLibrary general search for "${query}"`);
      const maxResults = params.maxResults || 20;
      const searchUrl = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=${maxResults}`;
      const response = await fetch(searchUrl, {
        headers: { "User-Agent": OPENLIBRARY_USER_AGENT }
      });
      if (!response.ok) {
        throw new Error(`OpenLibrary search API failed: ${response.status}`);
      }
      const data = await response.json();
      const normalized = normalizeOpenLibrarySearchResults(data.docs || []);
      if (!normalized.works || normalized.works.length === 0) {
        return null;
      }
      return normalized;
    },
    { query },
    env2
  );
}
__name(searchOpenLibrary, "searchOpenLibrary");
async function getOpenLibraryAuthorWorks(authorName, env2) {
  try {
    console.log(`OpenLibrary getAuthorWorks("${authorName}")`);
    const authorKey = await findAuthorKeyByName(authorName);
    if (!authorKey) {
      console.log("Author not found in OpenLibrary");
      return null;
    }
    const works = await getWorksByAuthorKey(authorKey);
    return {
      author: {
        name: authorName,
        openLibraryKey: authorKey
      },
      works
    };
  } catch (error3) {
    console.error(`Error in getAuthorWorks for "${authorName}":`, error3);
    throw error3;
  }
}
__name(getOpenLibraryAuthorWorks, "getOpenLibraryAuthorWorks");
function normalizeOpenLibrarySearchResults(docs) {
  const works = [];
  const editions = [];
  const authorsMap = /* @__PURE__ */ new Map();
  docs.forEach((doc) => {
    if (!doc.title) return;
    const work = normalizeOpenLibraryToWork(doc);
    const edition = normalizeOpenLibraryToEdition(doc);
    const authorNames = doc.author_name || ["Unknown Author"];
    const authors = authorNames.map(
      (name) => normalizeOpenLibraryToAuthor(name)
    );
    work.authors = authors;
    authors.forEach((author) => {
      if (!authorsMap.has(author.name)) {
        authorsMap.set(author.name, author);
      }
    });
    works.push(work);
    editions.push(edition);
  });
  return {
    works,
    editions,
    authors: Array.from(authorsMap.values())
  };
}
__name(normalizeOpenLibrarySearchResults, "normalizeOpenLibrarySearchResults");
async function findAuthorKeyByName(authorName) {
  const searchUrl = `https://openlibrary.org/search/authors.json?q=${encodeURIComponent(authorName)}&limit=1`;
  const response = await fetch(searchUrl, {
    headers: { "User-Agent": OPENLIBRARY_USER_AGENT }
  });
  if (!response.ok) throw new Error("OpenLibrary author search API failed");
  const data = await response.json();
  return data.docs && data.docs.length > 0 ? data.docs[0].key : null;
}
__name(findAuthorKeyByName, "findAuthorKeyByName");
async function getWorksByAuthorKey(authorKey) {
  const worksUrl = `https://openlibrary.org/authors/${authorKey}/works.json?limit=1000`;
  const response = await fetch(worksUrl, {
    headers: { "User-Agent": OPENLIBRARY_USER_AGENT }
  });
  if (!response.ok) throw new Error("OpenLibrary works fetch API failed");
  const data = await response.json();
  console.log(
    `OpenLibrary returned ${data.entries?.length || 0} works for ${authorKey}`
  );
  return (data.entries || []).map((work) => ({
    title: work.title,
    openLibraryWorkKey: work.key,
    firstPublicationYear: work.first_publish_year,
    editions: []
  }));
}
__name(getWorksByAuthorKey, "getWorksByAuthorKey");
var RATE_LIMIT_KEY = "isbndb_last_request";
var RATE_LIMIT_INTERVAL = 1e3;
async function searchISBNdb(title2, authorName, env2) {
  return logExternalApiCall(
    "ISBNdb",
    async () => {
      console.log(
        `ISBNdb search for "${title2}" by "${authorName || "any author"}"`
      );
      let searchUrl = `https://api2.isbndb.com/search/books?page=1&pageSize=20&text=${encodeURIComponent(title2)}`;
      if (authorName) {
        searchUrl += `&author=${encodeURIComponent(authorName)}`;
      }
      await enforceRateLimit(env2);
      const searchResponse = await fetchWithAuth(searchUrl, env2);
      if (!searchResponse.books || searchResponse.books.length === 0) {
        return null;
      }
      const works = [];
      const editions = [];
      const authorsSet = /* @__PURE__ */ new Set();
      for (const book of searchResponse.books) {
        const work = normalizeISBNdbToWork(book);
        const authorNames = book.authors || [];
        const workAuthors = [];
        authorNames.forEach((name) => {
          if (name) {
            const author = normalizeISBNdbToAuthor(name);
            workAuthors.push(author);
            if (!authorsSet.has(name)) {
              authorsSet.add(name);
            }
          }
        });
        work.authors = workAuthors;
        works.push(work);
        const edition = normalizeISBNdbToEdition(book);
        editions.push(edition);
      }
      const authors = Array.from(authorsSet).map(
        (name) => normalizeISBNdbToAuthor(name)
      );
      return {
        works,
        editions,
        authors
      };
    },
    { query: title2 },
    env2
  );
}
__name(searchISBNdb, "searchISBNdb");
async function getISBNdbEditionsForWork(title2, authorName, env2) {
  try {
    console.log(`ISBNdb getEditionsForWork ("${title2}", "${authorName}")`);
    const searchUrl = `https://api2.isbndb.com/books/${encodeURIComponent(title2)}?column=title&language=en&shouldMatchAll=1&pageSize=100`;
    await enforceRateLimit(env2);
    const searchResponse = await fetchWithAuth(searchUrl, env2);
    if (!searchResponse.books || searchResponse.books.length === 0) {
      return null;
    }
    const relevantBooks = searchResponse.books.filter(
      (book) => book.authors?.some(
        (a) => a.toLowerCase().includes(authorName.toLowerCase())
      )
    );
    if (relevantBooks.length === 0) {
      return null;
    }
    const editions = relevantBooks.map((book) => normalizeISBNdbToEdition(book)).sort((a, b) => b.isbndbQuality - a.isbndbQuality);
    return editions;
  } catch (error3) {
    console.error(`Error in getEditionsForWork for "${title2}":`, error3);
    throw error3;
  }
}
__name(getISBNdbEditionsForWork, "getISBNdbEditionsForWork");
async function getISBNdbBookByISBN(isbn, env2) {
  return logExternalApiCall(
    "ISBNdb",
    async () => {
      console.log(`ISBNdb getBookByISBN("${isbn}")`);
      const url = `https://api2.isbndb.com/book/${isbn}?with_prices=0`;
      await enforceRateLimit(env2);
      const response = await fetchWithAuth(url, env2);
      if (!response.book) {
        return null;
      }
      const book = response.book;
      const work = normalizeISBNdbToWork(book);
      const edition = normalizeISBNdbToEdition(book);
      const authorNames = book.authors || [];
      const authors = authorNames.map(
        (name) => normalizeISBNdbToAuthor(name)
      );
      return {
        work,
        edition,
        authors,
        book: response.book
      };
    },
    { isbn },
    env2
  );
}
__name(getISBNdbBookByISBN, "getISBNdbBookByISBN");
async function fetchWithAuth(url, env2) {
  const apiKey = env2.ISBNDB_API_KEY?.get ? await env2.ISBNDB_API_KEY.get() : env2.ISBNDB_API_KEY;
  if (!apiKey) throw new Error("ISBNDB_API_KEY secret not found");
  const response = await fetch(url, {
    headers: { Authorization: apiKey, Accept: "application/json" }
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ISBNdb API error: ${response.status} - ${errorText}`);
  }
  return response.json();
}
__name(fetchWithAuth, "fetchWithAuth");
async function enforceRateLimit(env2) {
  const kvBinding = env2.KV_CACHE || env2.CACHE;
  if (!kvBinding) {
    console.warn("No KV cache available for rate limiting");
    return;
  }
  const lastRequest = await kvBinding.get(RATE_LIMIT_KEY);
  if (lastRequest) {
    const timeDiff = Date.now() - parseInt(lastRequest);
    if (timeDiff < RATE_LIMIT_INTERVAL) {
      const waitTime = RATE_LIMIT_INTERVAL - timeDiff;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }
  await kvBinding.put(RATE_LIMIT_KEY, Date.now().toString(), {
    expirationTtl: 60
  });
}
__name(enforceRateLimit, "enforceRateLimit");

// src/services/enrichment.ts
async function enrichMultipleBooks(query, env2, options = { maxResults: 20 }) {
  const { title: title2, author, isbn } = query;
  const { maxResults = 20 } = options;
  if (isbn) {
    try {
      console.log(
        `enrichMultipleBooks: Searching Google Books by ISBN "${isbn}"`
      );
      const googleResult = await searchGoogleBooksByISBN(
        isbn,
        env2
      );
      if (googleResult && googleResult.works && googleResult.works.length > 0) {
        return {
          works: googleResult.works.map(
            (work) => addProvenanceFields(work, "google-books")
          ),
          editions: googleResult.editions || [],
          authors: googleResult.authors || []
        };
      }
      console.log(
        `enrichMultipleBooks: Google Books returned no results, trying OpenLibrary`
      );
    } catch (error3) {
      console.error(
        `enrichMultipleBooks: Google Books error for ISBN "${isbn}":`,
        error3
      );
      console.log(`enrichMultipleBooks: Trying OpenLibrary fallback`);
    }
    try {
      const olResult = await searchOpenLibrary(
        isbn,
        { maxResults: 1, isbn },
        env2
      );
      if (olResult && olResult.works && olResult.works.length > 0) {
        return {
          works: olResult.works.map(
            (work) => addProvenanceFields(work, "openlibrary")
          ),
          editions: olResult.editions || [],
          authors: olResult.authors || []
        };
      }
      console.log(`enrichMultipleBooks: OpenLibrary returned no results`);
    } catch (error3) {
      console.error(
        `enrichMultipleBooks: OpenLibrary error for ISBN "${isbn}":`,
        error3
      );
    }
    console.log(`enrichMultipleBooks: No results for ISBN "${isbn}"`);
    return { works: [], editions: [], authors: [] };
  }
  const searchQuery = [title2, author].filter(Boolean).join(" ");
  if (!searchQuery) {
    console.warn("enrichMultipleBooks: No search parameters provided");
    return { works: [], editions: [], authors: [] };
  }
  try {
    console.log(
      `enrichMultipleBooks: Searching Google Books for "${searchQuery}" (maxResults: ${maxResults})`
    );
    const googleResult = await searchGoogleBooks(
      searchQuery,
      { maxResults },
      env2
    );
    if (googleResult && googleResult.works && googleResult.works.length > 0) {
      return {
        works: googleResult.works.map(
          (work) => addProvenanceFields(work, "google-books")
        ),
        editions: googleResult.editions || [],
        authors: googleResult.authors || []
      };
    }
    console.log(
      `enrichMultipleBooks: Google Books returned no results, trying OpenLibrary`
    );
    const olResult = await searchOpenLibrary(
      searchQuery,
      { maxResults },
      env2
    );
    if (olResult && olResult.works && olResult.works.length > 0) {
      return {
        works: olResult.works.map(
          (work) => addProvenanceFields(work, "openlibrary")
        ),
        editions: olResult.editions || [],
        authors: olResult.authors || []
      };
    }
    if (title2?.trim() && author?.trim()) {
      console.log(
        `enrichMultipleBooks: OpenLibrary returned no results, trying ISBNdb`
      );
      const isbndbResult = await searchISBNdb(title2, author, env2);
      if (isbndbResult && isbndbResult.works && isbndbResult.works.length > 0) {
        console.log(
          `\u2705 ISBNdb SUCCESS: Found ${isbndbResult.works.length} works`
        );
        return {
          works: isbndbResult.works.map(
            (work) => addProvenanceFields(work, "isbndb")
          ),
          editions: isbndbResult.editions || [],
          authors: isbndbResult.authors || []
        };
      }
    }
    console.log(`enrichMultipleBooks: No results for "${searchQuery}"`);
    return { works: [], editions: [], authors: [] };
  } catch (error3) {
    console.error("enrichMultipleBooks error:", error3);
    return { works: [], editions: [], authors: [] };
  }
}
__name(enrichMultipleBooks, "enrichMultipleBooks");
async function enrichSingleBook(query, env2) {
  const { title: title2, author, isbn, openLibraryId, googleBooksId } = query;
  if (!title2 && !isbn && !author && !openLibraryId && !googleBooksId) {
    console.warn("enrichSingleBook: No search parameters provided");
    return null;
  }
  try {
    if (isbn) {
      const result = await searchByISBN(
        isbn,
        env2
      );
      if (result && (result.work.coverImageURL || result.edition?.coverImageURL)) {
        return result;
      }
    }
    if (googleBooksId) {
      const result = await searchGoogleBooksById(
        googleBooksId,
        env2
      );
      if (result && (result.work.coverImageURL || result.edition?.coverImageURL))
        return result;
    }
    if (openLibraryId) {
      const result = await searchOpenLibraryById(
        openLibraryId,
        env2
      );
      if (result && (result.work.coverImageURL || result.edition?.coverImageURL))
        return result;
    }
    if (query.goodreadsId) {
      const result = await searchOpenLibraryByGoodreadsId(query.goodreadsId, env2);
      if (result && (result.work.coverImageURL || result.edition?.coverImageURL))
        return result;
    }
    const googleResult = await searchGoogleBooks2(
      { title: title2, author },
      env2
    );
    if (googleResult && (googleResult.work.coverImageURL || googleResult.edition?.coverImageURL)) {
      return googleResult;
    }
    const openLibResult = await searchOpenLibrary2({ title: title2, author }, env2);
    if (openLibResult) {
      return openLibResult;
    }
    if (googleResult) {
      return googleResult;
    }
    console.log(`enrichSingleBook: No results for query:`, query);
    return null;
  } catch (error3) {
    console.error("enrichSingleBook error:", error3);
    return null;
  }
}
__name(enrichSingleBook, "enrichSingleBook");
async function searchGoogleBooks2(query, env2) {
  const { title: title2, author, isbn } = query;
  const searchQuery = isbn ? isbn : [title2, author].filter(Boolean).join(" ");
  const result = isbn ? await searchGoogleBooksByISBN(searchQuery, env2) : await searchGoogleBooks(searchQuery, { maxResults: 1 }, env2);
  if (!result || !result.works || result.works.length === 0) {
    return null;
  }
  const work = addProvenanceFields(result.works[0], "google-books");
  const edition = result.editions && result.editions.length > 0 ? result.editions[0] : null;
  const authors = result.authors || [];
  return { work, edition, authors };
}
__name(searchGoogleBooks2, "searchGoogleBooks");
async function searchOpenLibrary2(query, env2) {
  const { title: title2, author } = query;
  const searchQuery = [title2, author].filter(Boolean).join(" ");
  const result = await searchOpenLibrary(
    searchQuery,
    { maxResults: 1 },
    env2
  );
  if (!result || !result.works || result.works.length === 0) {
    return null;
  }
  const work = addProvenanceFields(result.works[0], "openlibrary");
  const edition = result.editions && result.editions.length > 0 ? result.editions[0] : null;
  const authors = result.authors || [];
  return { work, edition, authors };
}
__name(searchOpenLibrary2, "searchOpenLibrary");
async function searchByISBN(isbn, env2) {
  const googleResult = await searchGoogleBooks2(
    { isbn },
    env2
  );
  if (googleResult && (googleResult.work.coverImageURL || googleResult.edition?.coverImageURL)) {
    return googleResult;
  }
  const olResult = await searchOpenLibrary2(
    { isbn },
    env2
  );
  if (olResult) {
    return olResult;
  }
  if (googleResult) {
    return googleResult;
  }
  return null;
}
__name(searchByISBN, "searchByISBN");
function addProvenanceFields(work, provider) {
  return {
    ...work,
    // Preserve all existing normalized fields
    primaryProvider: provider,
    contributors: [provider],
    synthetic: false
    // Direct API result, not inferred
  };
}
__name(addProvenanceFields, "addProvenanceFields");

// src/utils/cache.js
function trackCacheEvent(env2, ctx, event) {
  if (!env2.CACHE_METRICS_DO) {
    return;
  }
  const doFetch = /* @__PURE__ */ __name(async () => {
    try {
      const id = env2.CACHE_METRICS_DO.idFromName("cache-metrics-singleton");
      const stub = env2.CACHE_METRICS_DO.get(id);
      await stub.fetch("http://do/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event)
      });
    } catch (error3) {
      console.error("Failed to track cache event:", error3);
    }
  }, "doFetch");
  if (ctx && ctx.waitUntil) {
    ctx.waitUntil(doFetch());
  } else {
    doFetch();
  }
}
__name(trackCacheEvent, "trackCacheEvent");
function extractPrefix(key) {
  const parts = key.split(":");
  return parts[0] || "unknown";
}
__name(extractPrefix, "extractPrefix");
async function getCached(key, env2, ctx = null) {
  const timestamp = Date.now();
  const prefix = extractPrefix(key);
  try {
    const { value, metadata } = await env2.CACHE.getWithMetadata(key, "json");
    if (value) {
      trackCacheEvent(env2, ctx, {
        type: "hit",
        prefix,
        key,
        timestamp,
        hotTtlExpiry: metadata?.hotTtlExpiry
      });
      if (value.data && value.cachedAt) {
        const age = Math.floor((Date.now() - value.cachedAt) / 1e3);
        const ttl = value.ttl || 0;
        return {
          data: value.data,
          cacheMetadata: {
            hit: true,
            age,
            ttl
          }
        };
      } else {
        return {
          data: value,
          cacheMetadata: {
            hit: true,
            age: 0,
            ttl: 0
          }
        };
      }
    }
  } catch (error3) {
    console.error("Cache read error:", error3);
  }
  trackCacheEvent(env2, ctx, {
    type: "miss",
    prefix,
    key,
    timestamp
  });
  return null;
}
__name(getCached, "getCached");
async function setCached(key, value, ttl, env2, ctx = null, hotTtl = null) {
  const timestamp = Date.now();
  const prefix = extractPrefix(key);
  try {
    const cachedWithMeta = {
      data: value,
      cachedAt: timestamp,
      // Timestamp for age calculation
      ttl
      // Original TTL for headers
    };
    const hotTtlExpiry = hotTtl ? timestamp + hotTtl * 1e3 : null;
    await env2.CACHE.put(key, JSON.stringify(cachedWithMeta), {
      expirationTtl: ttl,
      metadata: hotTtlExpiry ? { hotTtlExpiry } : {}
    });
    trackCacheEvent(env2, ctx, {
      type: "write",
      prefix,
      key,
      timestamp
    });
  } catch (error3) {
    console.error("Cache write error:", error3);
  }
}
__name(setCached, "setCached");
function generateCacheKey(prefix, params) {
  const sortedParams = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join("&");
  return `${prefix}:${sortedParams}`;
}
__name(generateCacheKey, "generateCacheKey");

// src/services/edge-cache.js
function trackEdgeCacheEvent(env2, ctx, event) {
  if (!env2?.CACHE_METRICS_DO) {
    return;
  }
  const doFetch = /* @__PURE__ */ __name(async () => {
    try {
      const id = env2.CACHE_METRICS_DO.idFromName("cache-metrics-singleton");
      const stub = env2.CACHE_METRICS_DO.get(id);
      await stub.fetch("http://do/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event)
      });
    } catch (error3) {
      console.error("Failed to track edge cache event:", error3);
    }
  }, "doFetch");
  if (ctx && ctx.waitUntil) {
    ctx.waitUntil(doFetch());
  } else {
    doFetch();
  }
}
__name(trackEdgeCacheEvent, "trackEdgeCacheEvent");
var EdgeCacheService = class {
  static {
    __name(this, "EdgeCacheService");
  }
  constructor(env2 = null, ctx = null) {
    this.env = env2;
    this.ctx = ctx;
  }
  /**
   * Get cached data from edge cache with SWR support
   * @param {string} cacheKey - Unique cache identifier
   * @param {Object} options - Cache options
   * @param {number} options.maxAge - Fresh TTL in seconds (default: 3600)
   * @param {number} options.staleWhileRevalidate - Stale TTL in seconds (default: 86400)
   * @returns {Promise<Object|null>} Cached data with metadata, or null if miss
   */
  async get(cacheKey, options = {}) {
    const maxAge = options.maxAge || 3600;
    const staleWhileRevalidate = options.staleWhileRevalidate || 86400;
    const timestamp = Date.now();
    try {
      const cache = caches.default;
      const request = new Request(`https://cache.internal/${cacheKey}`, {
        method: "GET"
      });
      const response = await cache.match(request);
      if (response) {
        const age = parseInt(response.headers.get("Age") || "0");
        const data = await response.json();
        if (age < maxAge) {
          trackEdgeCacheEvent(this.env, this.ctx, {
            type: "hit",
            prefix: "edge",
            key: cacheKey,
            timestamp,
            age
          });
          return {
            data,
            source: "EDGE_FRESH",
            age,
            latency: "<10ms"
          };
        }
        if (age < maxAge + staleWhileRevalidate) {
          trackEdgeCacheEvent(this.env, this.ctx, {
            type: "hit",
            prefix: "edge",
            key: cacheKey,
            timestamp,
            age,
            stale: true
          });
          return {
            data,
            source: "EDGE_STALE",
            age,
            stale: true,
            latency: "<10ms"
          };
        }
      }
    } catch (error3) {
      console.error(`Edge cache get failed for ${cacheKey}:`, error3);
    }
    trackEdgeCacheEvent(this.env, this.ctx, {
      type: "miss",
      prefix: "edge",
      key: cacheKey,
      timestamp
    });
    return null;
  }
  /**
   * Store data in edge cache with TTL and SWR support
   * @param {string} cacheKey - Unique cache identifier
   * @param {Object} data - Data to cache (must be JSON-serializable)
   * @param {number} ttl - Fresh TTL in seconds (max-age)
   * @param {number} staleWhileRevalidate - Stale TTL in seconds (default: 24 hours)
   * @returns {Promise<void>}
   */
  async set(cacheKey, data, ttl, staleWhileRevalidate = 86400) {
    const timestamp = Date.now();
    try {
      const cache = caches.default;
      const request = new Request(`https://cache.internal/${cacheKey}`, {
        method: "GET"
      });
      const response = new Response(JSON.stringify(data), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": `public, max-age=${ttl}, s-maxage=${ttl}, stale-while-revalidate=${staleWhileRevalidate}`,
          "X-Cache-Source": "edge",
          "X-Cache-TTL": ttl.toString(),
          "X-Cache-SWR": staleWhileRevalidate.toString()
        }
      });
      await cache.put(request, response);
      trackEdgeCacheEvent(this.env, this.ctx, {
        type: "write",
        prefix: "edge",
        key: cacheKey,
        timestamp,
        ttl
      });
    } catch (error3) {
      console.error(`Edge cache set failed for ${cacheKey}:`, error3);
    }
  }
};

// src/services/kv-cache.js
var KVCacheService = class {
  static {
    __name(this, "KVCacheService");
  }
  constructor(env2, ctx = null) {
    this.env = env2;
    this.ctx = ctx;
    this.ttls = {
      title: 7 * 24 * 60 * 60,
      // 7 days (was 24h)
      isbn: 365 * 24 * 60 * 60,
      // 365 days (was 30d)
      author: 7 * 24 * 60 * 60,
      // 7 days (unchanged)
      enrichment: 180 * 24 * 60 * 60,
      // 180 days (was 90d)
      cover: 365 * 24 * 60 * 60
      // 365 days (max practical - was Infinity which breaks KV writes)
    };
  }
  /**
   * Get cached data from KV
   * @param {string} cacheKey - Cache key
   * @param {string} endpoint - Endpoint type ('title', 'isbn', 'author')
   * @returns {Promise<Object|null>} Cached data with metadata or null
   */
  async get(cacheKey, endpoint) {
    try {
      const result = await getCached(cacheKey, this.env, this.ctx);
      if (result) {
        return {
          data: result.data,
          source: "KV",
          age: result.cacheMetadata.age,
          latency: "30-50ms"
        };
      }
    } catch (error3) {
      console.error(`KV cache get failed for ${cacheKey}:`, error3);
    }
    return null;
  }
  /**
   * Assess data quality for smart TTL adjustment
   * @param {Object} data - Response data with items array
   * @returns {number} Quality score 0.0 to 1.0
   */
  assessDataQuality(data) {
    const items = data.items || [];
    if (items.length === 0) return 0;
    let score = 0;
    for (const item of items) {
      const volumeInfo = item.volumeInfo;
      const hasISBN = volumeInfo?.industryIdentifiers?.length > 0;
      const hasCover = volumeInfo?.imageLinks?.thumbnail;
      const hasDescription = volumeInfo?.description?.length > 100;
      if (hasISBN) score += 0.4;
      if (hasCover) score += 0.4;
      if (hasDescription) score += 0.2;
    }
    return score / items.length;
  }
  /**
   * Adjust TTL based on data quality
   * @param {number} baseTTL - Base TTL in seconds
   * @param {number} quality - Quality score 0.0 to 1.0
   * @returns {number} Adjusted TTL in seconds
   */
  adjustTTLByQuality(baseTTL, quality) {
    if (quality > 0.8) return baseTTL * 2;
    if (quality < 0.4) return baseTTL * 0.5;
    return baseTTL;
  }
  /**
   * Store data in KV with smart TTL adjustment
   * @param {string} cacheKey - Cache key
   * @param {Object} data - Data to cache
   * @param {string} endpoint - Endpoint type ('title', 'isbn', 'author')
   * @param {Object} options - Optional overrides
   * @returns {Promise<void>}
   */
  async set(cacheKey, data, endpoint, options = {}) {
    try {
      const baseTTL = options.ttl || this.ttls[endpoint] || this.ttls.title;
      const quality = this.assessDataQuality(data);
      const adjustedTTL = this.adjustTTLByQuality(baseTTL, quality);
      const hotTTL = baseTTL;
      await setCached(cacheKey, data, adjustedTTL, this.env, this.ctx, hotTTL);
    } catch (error3) {
      console.error(`KV cache set failed for ${cacheKey}:`, error3);
    }
  }
};

// src/services/unified-cache.js
var UnifiedCacheService = class {
  static {
    __name(this, "UnifiedCacheService");
  }
  constructor(env2, ctx) {
    this.edgeCache = new EdgeCacheService(env2, ctx);
    this.kvCache = new KVCacheService(env2, ctx);
    this.env = env2;
    this.ctx = ctx;
  }
  /**
   * Get data from cache tiers (Edge → KV → API)
   * @param {string} cacheKey - Cache key
   * @param {string} endpoint - Endpoint type ('title', 'isbn', 'author')
   * @param {Object} options - Query options (query, maxResults, etc.)
   * @returns {Promise<Object>} Cached or fresh data with metadata
   */
  async get(cacheKey, endpoint, options = {}) {
    const startTime = Date.now();
    const edgeResult = await this.edgeCache.get(cacheKey, {
      maxAge: 3600,
      // 1 hour fresh
      staleWhileRevalidate: 86400
      // 24 hours stale
    });
    if (edgeResult) {
      if (!edgeResult.stale) {
        this.logMetrics("edge_hit_fresh", cacheKey, Date.now() - startTime);
        return edgeResult;
      }
      this.logMetrics("edge_hit_stale", cacheKey, Date.now() - startTime);
      console.log(
        `\u{1F504} Serving stale edge cache (age: ${edgeResult.age}s), triggering background refresh`
      );
      this.ctx.waitUntil(this.refreshStaleCache(cacheKey, endpoint, options));
      return edgeResult;
    }
    const kvResult = await this.kvCache.get(cacheKey, endpoint);
    if (kvResult) {
      this.ctx.waitUntil(
        this.edgeCache.set(cacheKey, kvResult.data, 6 * 60 * 60)
        // 6h edge TTL
      );
      this.logMetrics("kv_hit", cacheKey, Date.now() - startTime);
      return kvResult;
    }
    const coldIndex = await this.env.CACHE.get(
      `cold-index:${cacheKey}`,
      "json"
    );
    if (coldIndex) {
      this.logMetrics("cold_check", cacheKey, Date.now() - startTime);
      this.ctx.waitUntil(this.rehydrateFromR2(cacheKey, coldIndex, endpoint));
      return { data: null, source: "COLD", latency: Date.now() - startTime };
    }
    this.logMetrics("api_miss", cacheKey, Date.now() - startTime);
    return { data: null, source: "MISS", latency: Date.now() - startTime };
  }
  /**
   * Background refresh for stale cache entries
   * Fetches fresh data from API and updates all cache tiers
   *
   * @param {string} cacheKey - Cache key to refresh
   * @param {string} endpoint - Endpoint type
   * @param {Object} options - Original query options
   *
   * KNOWN LIMITATION (Sprint 1-2):
   * This is a stub implementation deferred to Sprint 3-4.
   * SWR currently serves stale data instantly (primary benefit), but does NOT
   * automatically refresh in background. Stale entries expire after 24h and
   * are re-fetched on next access.
   *
   * Impact: Low - book metadata staleness is minimal (ISBNs never change,
   * new editions are rare). Current behavior provides 99% of SWR benefits
   * (instant stale serving) without complexity of background refresh.
   *
   * Future: Implement actual refresh by calling handleAdvancedSearch() or
   * appropriate endpoint based on cache key pattern.
   */
  async refreshStaleCache(cacheKey, endpoint, options) {
    try {
      console.log(`\u{1F504} Background refresh started for: ${cacheKey}`);
      console.log(
        `\u26A0\uFE0F Background refresh stub - not yet implemented (deferred to Sprint 3-4)`
      );
    } catch (error3) {
      console.error(`\u274C Background refresh failed for ${cacheKey}:`, error3);
    }
  }
  /**
   * Rehydrate archived data from R2 to KV and Edge
   *
   * @param {string} cacheKey - Original cache key
   * @param {Object} coldIndex - Cold storage index metadata
   * @param {string} endpoint - Endpoint type
   */
  async rehydrateFromR2(cacheKey, coldIndex, endpoint) {
    try {
      console.log(`Rehydrating ${cacheKey} from R2...`);
      const r2Object = await this.env.LIBRARY_DATA.get(coldIndex.r2Path);
      if (!r2Object) {
        console.error(`R2 object not found: ${coldIndex.r2Path}`);
        return;
      }
      const data = await r2Object.json();
      await this.kvCache.set(cacheKey, data, endpoint, {
        ttl: 7 * 24 * 60 * 60
      });
      await this.edgeCache.set(cacheKey, data, 6 * 60 * 60);
      await this.env.CACHE.delete(`cold-index:${cacheKey}`);
      this.logMetrics("r2_rehydrated", cacheKey, 0);
      console.log(`Successfully rehydrated ${cacheKey}`);
    } catch (error3) {
      console.error(`Rehydration failed for ${cacheKey}:`, error3);
    }
  }
  /**
   * Log cache metrics to Analytics Engine
   * @param {string} event - Event type (edge_hit, kv_hit, api_miss)
   * @param {string} cacheKey - Cache key
   * @param {number} latency - Latency in milliseconds
   */
  logMetrics(event, cacheKey, latency) {
    if (!this.env.CACHE_ANALYTICS) return;
    try {
      this.env.CACHE_ANALYTICS.writeDataPoint({
        blobs: [event, cacheKey],
        doubles: [latency],
        indexes: [event]
      });
    } catch (error3) {
      console.error("Failed to log cache metrics:", error3);
    }
  }
};

// src/services/wikidata-enrichment.ts
function mapWikidataGender(genderId) {
  if (!genderId) return "Unknown";
  switch (genderId) {
    case "Q6581097":
    // male
    case "Q2449503":
      return "Male";
    case "Q6581072":
    // female
    case "Q1052281":
      return "Female";
    case "Q48270":
    // non-binary
    case "Q1097630":
      return "Non-binary";
    default:
      return "Unknown";
  }
}
__name(mapWikidataGender, "mapWikidataGender");
function mapNationalityToCulturalRegion(nationality) {
  const nationalityLower = nationality.toLowerCase();
  if (nationalityLower.match(
    /nigeria|kenya|ghana|south africa|egypt|morocco|ethiopia|tanzania|uganda|algeria|sudan|senegal|zimbabwe|rwanda|tunisia|cameroon|ivory coast|angola|madagascar|zambia|mozambique|botswana|namibia|mauritius|malawi|congo|somalia|mali|burkina faso|sierra leone|togo|benin|chad|liberia|guinea|gabon/
  )) {
    return "Africa";
  }
  if (nationalityLower.match(
    /china|japan|korea|india|thailand|vietnam|philippines|indonesia|malaysia|singapore|taiwan|hong kong|pakistan|bangladesh|myanmar|cambodia|laos|sri lanka|nepal|mongolia|bhutan|afghanistan|maldives/
  )) {
    return "Asia";
  }
  if (nationalityLower.match(
    /uk|england|scotland|wales|ireland|france|germany|italy|spain|russia|poland|ukraine|romania|netherlands|belgium|czech|greece|portugal|sweden|hungary|austria|switzerland|denmark|finland|norway|slovakia|croatia|serbia|bulgaria|belarus|lithuania|slovenia|latvia|estonia|albania|macedonia|bosnia|iceland|malta|luxembourg|montenegro|cyprus/
  )) {
    return "Europe";
  }
  if (nationalityLower.match(
    /united states|usa|canada|mexico|cuba|jamaica|haiti|dominican republic|guatemala|honduras|nicaragua|el salvador|costa rica|panama|bahamas|trinidad|barbados|belize/
  )) {
    return "North America";
  }
  if (nationalityLower.match(
    /brazil|argentina|colombia|venezuela|peru|chile|ecuador|bolivia|paraguay|uruguay|guyana|suriname|french guiana/
  )) {
    return "South America";
  }
  if (nationalityLower.match(
    /saudi arabia|iran|iraq|israel|palestine|jordan|lebanon|syria|yemen|oman|kuwait|bahrain|qatar|uae|emirates|turkey/
  )) {
    return "Middle East";
  }
  if (nationalityLower.match(
    /australia|new zealand|fiji|papua new guinea|samoa|tonga|solomon islands|vanuatu|micronesia|palau|kiribati|marshall islands|nauru|tuvalu/
  )) {
    return "Oceania";
  }
  if (nationalityLower.match(
    /caribbean|west indies|antigua|grenada|st lucia|st vincent|dominica|st kitts/
  )) {
    return "Caribbean";
  }
  if (nationalityLower.match(
    /kazakhstan|uzbekistan|turkmenistan|kyrgyzstan|tajikistan/
  )) {
    return "Central Asia";
  }
  if (nationalityLower.match(
    /indigenous|aboriginal|maori|native american|first nations|inuit/
  )) {
    return "Indigenous";
  }
  if (nationalityLower.match(/international|stateless|multiple|dual|refugee/)) {
    return "International";
  }
  return void 0;
}
__name(mapNationalityToCulturalRegion, "mapNationalityToCulturalRegion");
async function searchWikidataAuthor(authorName) {
  const searchUrl = new URL("https://www.wikidata.org/w/api.php");
  searchUrl.searchParams.set("action", "wbsearchentities");
  searchUrl.searchParams.set("search", authorName);
  searchUrl.searchParams.set("language", "en");
  searchUrl.searchParams.set("type", "item");
  searchUrl.searchParams.set("limit", "1");
  searchUrl.searchParams.set("format", "json");
  try {
    const response = await fetch(searchUrl.toString(), {
      headers: {
        "User-Agent": "BooksTrack/1.0 (https://api.oooefam.net; contact@oooefam.net)"
      }
    });
    if (!response.ok) {
      console.error(
        `[Wikidata] Search failed for "${authorName}": ${response.status}`
      );
      return null;
    }
    const data = await response.json();
    if (!data.search || data.search.length === 0) {
      console.log(`[Wikidata] No results for "${authorName}"`);
      return null;
    }
    const entityId = data.search[0].id;
    console.log(`[Wikidata] Found "${authorName}" \u2192 ${entityId}`);
    return entityId;
  } catch (error3) {
    console.error(
      `[Wikidata] Search error for "${authorName}":`,
      error3.message
    );
    return null;
  }
}
__name(searchWikidataAuthor, "searchWikidataAuthor");
async function fetchWikidataEntity(entityId) {
  const entityUrl = `https://www.wikidata.org/wiki/Special:EntityData/${entityId}.json`;
  try {
    const response = await fetch(entityUrl, {
      headers: {
        "User-Agent": "BooksTrack/1.0 (https://api.oooefam.net; contact@oooefam.net)"
      }
    });
    if (!response.ok) {
      console.error(
        `[Wikidata] Entity fetch failed for ${entityId}: ${response.status}`
      );
      return null;
    }
    const data = await response.json();
    return data.entities[entityId];
  } catch (error3) {
    console.error(
      `[Wikidata] Entity fetch error for ${entityId}:`,
      error3.message
    );
    return null;
  }
}
__name(fetchWikidataEntity, "fetchWikidataEntity");
function extractYearFromWikidataTime(timeValue) {
  if (!timeValue) return void 0;
  const match2 = timeValue.match(/^[+-]?(\d{1,4})-/);
  return match2 ? parseInt(match2[1], 10) : void 0;
}
__name(extractYearFromWikidataTime, "extractYearFromWikidataTime");
function getPropertyValue(entity, propertyId) {
  const claims = entity?.claims?.[propertyId];
  if (!claims || claims.length === 0) return void 0;
  const mainSnak = claims[0]?.mainsnak;
  if (!mainSnak?.datavalue) return void 0;
  if (mainSnak.datavalue.type === "wikibase-entityid") {
    return mainSnak.datavalue.value.id;
  }
  if (mainSnak.datavalue.type === "time") {
    return mainSnak.datavalue.value.time;
  }
  if (mainSnak.datavalue.type === "string") {
    return mainSnak.datavalue.value;
  }
  return void 0;
}
__name(getPropertyValue, "getPropertyValue");
function getEntityLabel(entity) {
  return entity?.labels?.en?.value;
}
__name(getEntityLabel, "getEntityLabel");
async function enrichAuthorWithWikidata(authorName, env2) {
  const cacheKey = `wikidata:author:${authorName.toLowerCase()}`;
  const cached = await env2.KV_CACHE?.get(cacheKey, "json");
  if (cached) {
    console.log(`[Wikidata] Cache HIT for "${authorName}"`);
    return cached;
  }
  const entityId = await searchWikidataAuthor(authorName);
  if (!entityId) {
    const notFoundResult = { gender: "Unknown" };
    await env2.KV_CACHE?.put(cacheKey, JSON.stringify(notFoundResult), {
      expirationTtl: 604800
      // 7 days
    });
    return notFoundResult;
  }
  const entity = await fetchWikidataEntity(entityId);
  if (!entity) {
    const notFoundResult = { gender: "Unknown" };
    return notFoundResult;
  }
  const genderId = getPropertyValue(entity, "P21");
  const nationalityId = getPropertyValue(entity, "P27");
  const birthTime = getPropertyValue(entity, "P569");
  const deathTime = getPropertyValue(entity, "P570");
  let nationality;
  if (nationalityId) {
    const nationalityEntity = await fetchWikidataEntity(nationalityId);
    nationality = getEntityLabel(nationalityEntity);
  }
  const result = {
    gender: mapWikidataGender(genderId),
    nationality,
    culturalRegion: nationality ? mapNationalityToCulturalRegion(nationality) : void 0,
    birthYear: extractYearFromWikidataTime(birthTime),
    deathYear: extractYearFromWikidataTime(deathTime),
    wikidataId: entityId
  };
  console.log(`[Wikidata] Enriched "${authorName}":`, result);
  await env2.KV_CACHE?.put(cacheKey, JSON.stringify(result), {
    expirationTtl: 604800
    // 7 days
  });
  return result;
}
__name(enrichAuthorWithWikidata, "enrichAuthorWithWikidata");

// src/utils/response-transformer.ts
function extractUniqueAuthors(works) {
  const authorsMap = /* @__PURE__ */ new Map();
  works.forEach((work) => {
    (work.authors || []).forEach((author) => {
      if (!authorsMap.has(author.name)) {
        authorsMap.set(author.name, author);
      }
    });
  });
  return Array.from(authorsMap.values());
}
__name(extractUniqueAuthors, "extractUniqueAuthors");
function removeAuthorsFromWorks(works) {
  return works.map((work) => {
    const { authors: _, ...cleanWork } = work;
    return cleanWork;
  });
}
__name(removeAuthorsFromWorks, "removeAuthorsFromWorks");
async function enrichAuthorsWithCulturalData(authors, env2) {
  const enrichmentPromises = authors.map(async (author) => {
    if (author.gender && author.gender !== "Unknown") {
      return author;
    }
    try {
      const wikidataData = await enrichAuthorWithWikidata(author.name, env2);
      if (!wikidataData) {
        return author;
      }
      return {
        ...author,
        gender: wikidataData.gender,
        culturalRegion: wikidataData.culturalRegion,
        nationality: wikidataData.nationality,
        birthYear: wikidataData.birthYear,
        deathYear: wikidataData.deathYear
      };
    } catch (error3) {
      console.error(
        `[Wikidata] Enrichment failed for "${author.name}":`,
        error3.message
      );
      return author;
    }
  });
  return await Promise.all(enrichmentPromises);
}
__name(enrichAuthorsWithCulturalData, "enrichAuthorsWithCulturalData");

// src/services/cache-key-factory.js
var CacheKeyFactory = class {
  static {
    __name(this, "CacheKeyFactory");
  }
  /**
   * Generate cache key for author search
   *
   * This matches the pattern used in author-search.js for consistency
   * with existing cached data.
   *
   * @param {Object} params - Search parameters
   * @param {string} params.query - Author name to search
   * @param {number} params.maxResults - Maximum results to return (default: 50)
   * @param {boolean} params.showAllEditions - Whether to show all editions (default: false)
   * @param {string} params.sortBy - Sort order (default: 'publicationYear')
   * @returns {string} Cache key in format: auto-search:{queryB64}:{paramsB64}
   */
  static authorSearch(params) {
    const {
      query,
      maxResults = 50,
      showAllEditions = false,
      sortBy = "publicationYear"
    } = params;
    const normalizedQuery = query.toLowerCase().trim();
    const queryB64 = btoa(normalizedQuery).replace(/[/+=]/g, "_");
    const searchParams = {
      maxResults,
      showAllEditions,
      sortBy
    };
    const paramsString = Object.keys(searchParams).sort().map((key) => `${key}=${searchParams[key]}`).join("&");
    const paramsB64 = btoa(paramsString).replace(/[/+=]/g, "_");
    return `auto-search:${queryB64}:${paramsB64}`;
  }
  /**
   * Generate cache key for ISBN book search
   *
   * @param {string} isbn - ISBN-10 or ISBN-13
   * @returns {string} Cache key in format: search:isbn:isbn={normalizedISBN}
   */
  static bookISBN(isbn) {
    const normalizedISBN = isbn.replace(/-/g, "");
    return `search:isbn:isbn=${normalizedISBN}`;
  }
  /**
   * Generate cache key for title search
   *
   * @param {string} title - Book title
   * @param {number} maxResults - Maximum results to return (default: 20)
   * @returns {string} Cache key in format: search:title:maxresults={n}&title={normalizedTitle}
   */
  static bookTitle(title2, maxResults = 20) {
    const normalizedTitle = title2.toLowerCase().trim();
    return `search:title:maxresults=${maxResults}&title=${normalizedTitle}`;
  }
  /**
   * Generate cache key for cover images
   *
   * @param {string} isbn - ISBN identifier
   * @returns {string} Cache key in format: cover:{normalizedISBN}
   */
  static coverImage(isbn) {
    const normalizedISBN = isbn.replace(/-/g, "");
    return `cover:${normalizedISBN}`;
  }
  /**
   * Generate a generic cache key with sorted parameters
   *
   * This is a utility method for handlers that need custom cache keys
   * but still want consistent parameter ordering.
   *
   * @param {string} prefix - Cache key prefix (e.g., 'search:title')
   * @param {Object} params - Key-value pairs to include in cache key
   * @returns {string} Generated cache key in format: {prefix}:{param1}={value1}&{param2}={value2}
   */
  static generic(prefix, params) {
    const sortedParams = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join("&");
    return `${prefix}:${sortedParams}`;
  }
};

// src/handlers/v1/search-advanced.ts
async function handleSearchAdvanced(title2, author, env2, ctx, request = null) {
  const startTime = Date.now();
  const hasTitle = title2 && title2.trim().length > 0;
  const hasAuthor = author && author.trim().length > 0;
  if (!hasTitle && !hasAuthor) {
    return createErrorResponse(
      "At least one of title or author is required",
      400,
      ErrorCodes.INVALID_QUERY,
      { title: title2, author },
      request
    );
  }
  try {
    const normalizedTitle = hasTitle ? normalizeTitle(title2) : "";
    const normalizedAuthor = hasAuthor ? normalizeAuthor(author) : "";
    const cacheKey = CacheKeyFactory.generic("v1:advanced", {
      title: normalizedTitle,
      author: normalizedAuthor
    });
    const cache = new UnifiedCacheService(env2, ctx);
    const cachedResult = await cache.get(cacheKey, "advanced", {
      query: `${title2} ${author}`.trim()
    });
    if (cachedResult?.data) {
      console.log(`\u2705 Cache HIT: /v1/search/advanced (${cacheKey})`);
      const data = cachedResult.data.data;
      if (data && typeof data.resultCount === "undefined") {
        data.resultCount = data.works?.length || 0;
      }
      return createSuccessResponse(
        data,
        {
          ...cachedResult.data.meta,
          cached: true,
          cacheSource: cachedResult.source
          // EDGE or KV
        },
        200,
        request
      );
    }
    console.log(
      `v1 advanced search - title: "${title2}" (normalized: "${normalizedTitle}"), author: "${author}" (normalized: "${normalizedAuthor}") (using enrichMultipleBooks, maxResults: 20)`
    );
    const result = await enrichMultipleBooks(
      {
        title: normalizedTitle,
        author: normalizedAuthor
      },
      env2,
      { maxResults: 20 }
    );
    if (!result || !result.works || result.works.length === 0) {
      return createSuccessResponse(
        { works: [], editions: [], authors: [], resultCount: 0 },
        {
          processingTime: Date.now() - startTime,
          provider: "none",
          cached: false
        },
        200,
        request
      );
    }
    const baseAuthors = extractUniqueAuthors(result.works);
    const authors = await enrichAuthorsWithCulturalData(baseAuthors, env2);
    const cleanWorks = removeAuthorsFromWorks(result.works);
    const response = createSuccessResponse(
      {
        works: cleanWorks,
        editions: result.editions,
        authors,
        resultCount: cleanWorks.length
      },
      {
        processingTime: Date.now() - startTime,
        provider: cleanWorks[0]?.primaryProvider,
        // Use actual provider from enriched work
        cached: false
      },
      200,
      request
    );
    const legacyResponseObject = {
      success: true,
      data: {
        works: cleanWorks,
        editions: result.editions,
        authors,
        resultCount: cleanWorks.length
      },
      meta: {
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        processingTime: Date.now() - startTime,
        provider: cleanWorks[0]?.primaryProvider,
        cached: false
      }
    };
    const ttl = 7 * 24 * 60 * 60;
    ctx.waitUntil(setCached(cacheKey, legacyResponseObject, ttl, env2));
    console.log(
      `\u{1F4BE} Cache WRITE: /v1/search/advanced (${cacheKey}, TTL: ${ttl}s)`
    );
    return response;
  } catch (error3) {
    console.error("Error in v1 advanced search:", error3);
    return createErrorResponse(
      error3.message || "Internal server error",
      500,
      ErrorCodes.INTERNAL_ERROR,
      { error: error3.toString(), processingTime: Date.now() - startTime },
      request
    );
  }
}
__name(handleSearchAdvanced, "handleSearchAdvanced");

// src/providers/gemini-provider.js
async function scanImageWithGemini(imageData, env2) {
  const startTime = Date.now();
  console.log(
    "[GeminiProvider] DIAGNOSTIC: Checking GEMINI_API_KEY binding..."
  );
  console.log(
    "[GeminiProvider] env.GEMINI_API_KEY exists:",
    !!env2.GEMINI_API_KEY
  );
  console.log(
    "[GeminiProvider] env.GEMINI_API_KEY.get exists:",
    !!env2.GEMINI_API_KEY?.get
  );
  const apiKey = env2.GEMINI_API_KEY?.get ? await env2.GEMINI_API_KEY.get() : env2.GEMINI_API_KEY;
  console.log("[GeminiProvider] DIAGNOSTIC: API key retrieved:", !!apiKey);
  console.log(
    "[GeminiProvider] DIAGNOSTIC: API key length:",
    apiKey?.length || 0
  );
  if (!apiKey) {
    console.error(
      "[GeminiProvider] ERROR: GEMINI_API_KEY not configured or empty"
    );
    throw new Error("GEMINI_API_KEY not configured");
  }
  const base64Image = Buffer.from(imageData).toString("base64");
  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
    {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        // System instruction: Define role and output format (static, won't change)
        system_instruction: {
          parts: [
            {
              text: `You are an expert bookshelf analyzer specialized in extracting book metadata from shelf photos.

Your task is to identify every book in the provided image and extract its title, author, and physical format.

- Only include books where you can clearly read at least the title.
- Skip decorative items or any non-book objects.
- Assign a confidence score (0.0-1.0) based on the clarity of the extracted text.
- Provide a bounding box with normalized coordinates (0.0-1.0) for each book spine.
- Adhere strictly to the JSON output format defined in the schema.`
            }
          ]
        },
        contents: [
          {
            parts: [
              {
                inline_data: {
                  mime_type: "image/jpeg",
                  data: base64Image
                }
              },
              {
                text: `Analyze this bookshelf image step by step:

1. **Identify individual book spines**: Look for vertical or horizontal book orientations
2. **Handle common challenges**:
   - Vertical spines with sideways text
   - Horizontal stacks with upward-facing covers
   - Partial visibility (books cut off at frame edges)
   - Glare or reflections on glossy covers
   - Low contrast text on dark spines
   - Books tilted or at angles
3. **Extract text carefully**: For each readable book spine:
   - Title (required)
   - Author name (if visible)
   - Assign confidence based on text clarity
4. **Detect physical format**: Based on visual cues (size, spine flexibility, texture)
5. **Return structured JSON**: Only include books with readable titles

Extract all visible book information now.`
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.4,
          // Balanced: deterministic enough for accuracy, flexible enough for inference
          topK: 40,
          // Allow some variation for better book spine recognition
          topP: 0.95,
          // Nucleus sampling for quality
          maxOutputTokens: 8192,
          // Increased from 2048 to prevent truncation with many books
          responseMimeType: "application/json",
          // Force JSON output
          responseSchema: BOOKSHELF_RESPONSE_SCHEMA
          // Schema-enforced validation (guarantees structure)
          // Removed stopSequences - was causing premature truncation
        }
      })
    }
  );
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[GeminiProvider] Gemini API error: ${response.status}`);
    console.error(`[GeminiProvider] Error details:`, errorText);
    throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
  }
  console.log("[GeminiProvider] Gemini API response OK, parsing JSON...");
  const geminiData = await response.json();
  console.log("[GeminiProvider] Response parsed, checking for candidates...");
  const tokenUsage = geminiData.usageMetadata || {};
  const promptTokens = tokenUsage.promptTokenCount || 0;
  const outputTokens = tokenUsage.candidatesTokenCount || 0;
  const totalTokens = tokenUsage.totalTokenCount || 0;
  console.log(
    `[GeminiProvider] Token usage - Prompt: ${promptTokens}, Output: ${outputTokens}, Total: ${totalTokens}`
  );
  const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    console.error("[GeminiProvider] Empty response");
    return {
      books: [],
      suggestions: [],
      metadata: {
        provider: "gemini",
        model: "gemini-2.0-flash-exp",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        processingTimeMs: Date.now() - startTime,
        tokenUsage: {
          promptTokens,
          outputTokens,
          totalTokens
        }
      }
    };
  }
  let books;
  try {
    books = JSON.parse(text);
  } catch (error3) {
    console.error("[GeminiProvider] JSON parsing failed:", error3);
    console.error("[GeminiProvider] Raw text that failed parsing:", text);
    return {
      books: [],
      suggestions: [],
      metadata: {
        provider: "gemini",
        model: "gemini-2.5-flash",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        processingTimeMs: Date.now() - startTime,
        tokenUsage: {
          promptTokens,
          outputTokens,
          totalTokens
        },
        error: "Failed to parse Gemini response as JSON."
      }
    };
  }
  if (!Array.isArray(books)) {
    console.error(
      "[GeminiProvider] Schema violation: Expected array, got",
      typeof books
    );
    return {
      books: [],
      suggestions: [],
      metadata: {
        provider: "gemini",
        model: "gemini-2.5-flash",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        processingTimeMs: Date.now() - startTime,
        tokenUsage: {
          promptTokens,
          outputTokens,
          totalTokens
        }
      }
    };
  }
  const normalizedBooks = books.map((book) => ({
    title: book.title,
    author: book.author || "",
    isbn: book.isbn || null,
    format: book.format || "unknown",
    // Default to unknown if not provided
    confidence: book.confidence || 0.7,
    // Default confidence if not provided
    boundingBox: null
    // Removed from schema (debugging)
  })).filter((book) => book.title && book.title.length > 0);
  return {
    books: normalizedBooks,
    suggestions: [],
    // Gemini doesn't provide suggestions in current implementation
    metadata: {
      provider: "gemini",
      model: "gemini-2.5-flash",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      processingTimeMs: Date.now() - startTime,
      tokenUsage: {
        promptTokens,
        outputTokens,
        totalTokens
      }
    }
  };
}
__name(scanImageWithGemini, "scanImageWithGemini");

// src/services/parallel-enrichment.js
var DEFAULT_CONCURRENCY = 10;
async function enrichBooksParallel(books, enrichFn, progressCallback, concurrency = DEFAULT_CONCURRENCY) {
  const results = [];
  const errors = [];
  let completed = 0;
  for (let i = 0; i < books.length; i += concurrency) {
    const batch = books.slice(i, i + concurrency);
    const batchPromises = batch.map(async (book, batchIndex) => {
      try {
        const enriched = await enrichFn(book);
        completed++;
        await progressCallback(completed, books.length, book, false);
        return enriched;
      } catch (error3) {
        completed++;
        const errorBook = {
          ...book,
          enrichmentError: error3.message
        };
        errors.push({ title: book.title, error: error3.message });
        await progressCallback(completed, books.length, book, true);
        return errorBook;
      }
    });
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
  }
  return results;
}
__name(enrichBooksParallel, "enrichBooksParallel");

// src/services/ai-scanner.js
function debugLog(env2, logFn) {
  if (env2.LOG_LEVEL === "DEBUG") {
    logFn();
  }
}
__name(debugLog, "debugLog");
var PROGRESS_STAGES = {
  QUALITY_ANALYSIS: 0.1,
  // Image quality check (10%)
  AI_PROCESSING: 0.3,
  // Gemini AI vision processing (30%)
  DETECTION_COMPLETE: 0.5,
  // Book detection complete (50%)
  ENRICHMENT_START: 0.7,
  // Begin parallel enrichment (70%)
  ENRICHMENT_DELTA: 0.25,
  // Enrichment progress range (70% → 95%)
  FINALIZATION: 1
  // Complete and send results (100%)
};
async function processBookshelfScan(jobId, imageData, request, env2, doStub, ctx) {
  const startTime = Date.now();
  try {
    console.log(
      `[AI Scanner] Starting scan for job ${jobId}, image size: ${imageData.byteLength} bytes`
    );
    const elapsedMs = Date.now() - startTime;
    if (elapsedMs > 6e3) {
      console.warn(
        `[AI Scanner] Job ${jobId} started ${elapsedMs}ms after request - possible ready timeout`
      );
    }
    await doStub.initializeJobState("ai_scan", 3);
    await doStub.updateProgress("ai_scan", {
      progress: PROGRESS_STAGES.QUALITY_ANALYSIS,
      status: "Analyzing image quality...",
      processedCount: 0,
      currentItem: "Image quality check"
    });
    debugLog(env2, () => {
      console.log(
        `[AI Scanner] Progress pushed: ${PROGRESS_STAGES.QUALITY_ANALYSIS * 100}% (image quality analysis)`
      );
    });
    await doStub.updateProgress("ai_scan", {
      progress: PROGRESS_STAGES.AI_PROCESSING,
      status: "Processing with Gemini AI...",
      processedCount: 1,
      currentItem: "Gemini AI processing"
    });
    console.log(`[AI Scanner] Job ${jobId} - Using Gemini 2.0 Flash`);
    let scanResult;
    let modelUsed = "unknown";
    try {
      scanResult = await scanImageWithGemini(imageData, env2);
      console.log("[AI Scanner] Gemini processing complete");
      modelUsed = scanResult.metadata?.model || "unknown";
      console.log(`[AI Scanner] Model used: ${modelUsed}`);
    } catch (aiError) {
      console.error("[AI Scanner] Gemini processing failed:", aiError.message);
      throw aiError;
    }
    const detectedBooks = scanResult.books;
    const suggestions = scanResult.suggestions || [];
    console.log(
      `[AI Scanner] ${detectedBooks.length} books detected (${scanResult.metadata.processingTimeMs}ms)`
    );
    await doStub.updateProgress("ai_scan", {
      progress: PROGRESS_STAGES.DETECTION_COMPLETE,
      status: `Detected ${detectedBooks.length} books, enriching data...`,
      processedCount: 1,
      currentItem: `${detectedBooks.length} books detected`
    });
    const enrichedBooks = await enrichBooksParallel(
      detectedBooks,
      async (book) => {
        debugLog(env2, () => {
          console.log(
            `[AI Scanner] Enriching book: "${book.title}" by ${book.author || "unknown"}`
          );
        });
        const apiResponse = await handleSearchAdvanced(
          book.title || "",
          book.author || "",
          env2,
          ctx
          // Pass execution context for waitUntil support
        );
        if (apiResponse.success) {
          const work = apiResponse.data.works?.[0] || null;
          const editions = apiResponse.data.editions || [];
          const authors = apiResponse.data.authors || [];
          debugLog(env2, () => {
            console.log(
              `[AI Scanner] \u2705 Enrichment ${work ? "found" : "not found"} for "${book.title}": work=${!!work}, editions=${editions.length}, authors=${authors.length}`
            );
          });
          return {
            ...book,
            enrichment: {
              status: work ? "success" : "not_found",
              work,
              editions,
              authors,
              provider: apiResponse.meta.provider,
              cachedResult: apiResponse.meta.cached || false
            }
          };
        } else {
          console.error(
            `[AI Scanner] \u274C Enrichment failed for "${book.title}": ${apiResponse.error.message}`
          );
          return {
            ...book,
            enrichment: {
              status: "error",
              error: apiResponse.error.message,
              work: null,
              editions: [],
              authors: []
            }
          };
        }
      },
      async (completed, total, title2, hasError) => {
        const progress = PROGRESS_STAGES.ENRICHMENT_START + PROGRESS_STAGES.ENRICHMENT_DELTA * completed / total;
        await doStub.updateProgress("ai_scan", {
          progress,
          status: hasError ? `Enriched ${completed}/${total} books (${title2} failed)` : `Enriched ${completed}/${total} books`,
          processedCount: 2,
          currentItem: `Enriching: ${title2}`
        });
      },
      10
      // 10 concurrent requests (matches CSV import concurrency)
    );
    const threshold = parseFloat(env2.CONFIDENCE_THRESHOLD || "0.6");
    const approved = enrichedBooks.filter((b) => b.confidence >= threshold);
    const review = enrichedBooks.filter((b) => b.confidence < threshold);
    const processingTime = Date.now() - startTime;
    const books = enrichedBooks.map((b) => ({
      title: b.title,
      author: b.author,
      isbn: b.isbn || null,
      confidence: b.confidence,
      boundingBox: b.boundingBox,
      enrichmentStatus: b.enrichment?.status || "pending",
      coverUrl: b.enrichment?.work?.coverImageURL || null,
      publisher: b.enrichment?.editions?.[0]?.publisher || null,
      publicationYear: b.enrichment?.editions?.[0]?.publicationYear || null
    }));
    debugLog(env2, () => {
      console.log(
        `[AI Scanner] \u{1F4E6} Built books array with ${books.length} books:`
      );
      console.log(
        `[AI Scanner] Sample book 0:`,
        JSON.stringify(books[0], null, 2)
      );
      console.log(
        `[AI Scanner] Enrichment summary: ${enrichedBooks.filter((b) => b.enrichment?.status === "success").length} success, ${enrichedBooks.filter((b) => b.enrichment?.status === "not_found").length} not_found, ${enrichedBooks.filter((b) => b.enrichment?.status === "error").length} error`
      );
    });
    await doStub.updateProgress("ai_scan", {
      progress: PROGRESS_STAGES.FINALIZATION,
      status: "Scan complete, finalizing results...",
      processedCount: 3,
      currentItem: "Finalizing"
    });
    const resultsKey = `scan-results:${jobId}`;
    const fullResults = {
      totalDetected: detectedBooks.length,
      approved: approved.length,
      needsReview: review.length,
      books,
      metadata: {
        modelUsed,
        processingTime,
        timestamp: Date.now()
      }
    };
    await env2.KV_CACHE.put(resultsKey, JSON.stringify(fullResults), {
      expirationTtl: 86400
      // 24 hours
    });
    debugLog(env2, () => {
      console.log(
        `[AI Scanner] \u{1F4BE} Stored full results in KV: ${resultsKey} (${books.length} books)`
      );
    });
    const completionPayload = {
      totalDetected: detectedBooks.length,
      approved: approved.length,
      needsReview: review.length,
      resultsUrl: `/v1/scan/results/${jobId}`,
      // Client fetches full results via HTTP GET
      metadata: {
        modelUsed,
        processingTime
      }
    };
    debugLog(env2, () => {
      console.log(
        `[AI Scanner] \u{1F4E4} Sending summary-only completion:`,
        JSON.stringify(completionPayload)
      );
    });
    await doStub.complete("ai_scan", completionPayload);
    console.log(
      `[AI Scanner] Scan complete for job ${jobId}: ${detectedBooks.length} books, ${processingTime}ms`
    );
  } catch (error3) {
    console.error(`[AI Scanner] Scan failed for job ${jobId}:`, error3);
    await doStub.sendError("ai_scan", {
      code: "E_AI_SCAN_FAILED",
      message: error3.message,
      retryable: true,
      details: {
        jobId,
        stage: "AI processing"
      }
    });
  }
}
__name(processBookshelfScan, "processBookshelfScan");

// src/durable-objects/progress-socket.js
var BLACKLIST_TTL_SECONDS = 2.5 * 60 * 60;
var THROTTLE_CONFIG = {
  batch_enrichment: { updateCount: 5, timeSeconds: 10 },
  csv_import: { updateCount: 20, timeSeconds: 30 },
  // Reduced writes
  ai_scan: { updateCount: 1, timeSeconds: 60 }
  // Minimal writes
};
var ProgressWebSocketDO = class extends DurableObject {
  static {
    __name(this, "ProgressWebSocketDO");
  }
  constructor(state, env2) {
    super(state, env2);
    this.storage = state.storage;
    this.webSocket = null;
    this.jobId = null;
    this.isReady = false;
    this.readyPromise = null;
    this.readyResolver = null;
    this.refreshInProgress = false;
    this.updatesSinceLastPersist = 0;
    this.lastPersistTime = 0;
    this.currentPipeline = null;
  }
  /**
   * Handle WebSocket upgrade request from iOS client
   *
   * PERFORMANCE OPTIMIZATION (Issue #407):
   * - Added timing metrics for diagnostics
   * - Parallelized storage reads (100-200ms improvement on cold starts)
   * - Reduced sequential async operations during upgrade
   *
   * RECONNECTION SUPPORT (Issue #127):
   * - Detects reconnection attempts via 'reconnect=true' query param
   * - Restores job state and sends current progress to reconnected clients
   * - Gracefully closes old WebSocket before establishing new connection
   */
  async fetch(request) {
    const upgradeStartTime = Date.now();
    const url = new URL(request.url);
    const upgradeHeader = request.headers.get("Upgrade");
    console.log("[ProgressDO] Incoming request", {
      url: url.toString(),
      upgradeHeader,
      method: request.method,
      timestamp: upgradeStartTime
    });
    if (!upgradeHeader || upgradeHeader !== "websocket") {
      console.warn("[ProgressDO] Invalid upgrade header", { upgradeHeader });
      return new Response("Expected Upgrade: websocket", {
        status: 426,
        headers: {
          ...getCorsHeaders(request),
          "Content-Type": "text/plain"
        }
      });
    }
    const jobId = url.searchParams.get("jobId");
    if (!jobId) {
      console.error("[ProgressDO] Missing jobId parameter");
      return new Response("Missing jobId parameter", {
        status: 400,
        headers: getCorsHeaders(request)
      });
    }
    const isReconnect = url.searchParams.get("reconnect") === "true";
    if (isReconnect) {
      console.log(`[${jobId}] \u2705 Reconnection request detected`);
    }
    const wsProtocol = request.headers.get("Sec-WebSocket-Protocol");
    let providedToken = null;
    let tokenSource = null;
    if (wsProtocol) {
      const protocols = wsProtocol.split(",").map((p) => p.trim());
      const authProtocol = protocols.find(
        (p) => p.startsWith("bookstrack-auth.")
      );
      if (authProtocol) {
        providedToken = authProtocol.substring("bookstrack-auth.".length);
        tokenSource = "subprotocol";
        console.log(
          `[${jobId}] \u2705 Token provided via secure subprotocol header`
        );
      }
    }
    if (!providedToken) {
      providedToken = url.searchParams.get("token");
      if (providedToken) {
        tokenSource = "query_param";
        console.warn(
          `[${jobId}] \u26A0\uFE0F DEPRECATED: Token provided via URL query parameter (INSECURE). Client should migrate to Sec-WebSocket-Protocol header. See API_CONTRACT.md \xA77.5`
        );
      }
    }
    const storageStartTime = Date.now();
    const [storedToken, expiration, blacklistEntry] = await Promise.all([
      this.storage.get("authToken"),
      this.storage.get("authTokenExpiration"),
      providedToken ? this.storage.get(`blacklistedToken:${providedToken}`) : Promise.resolve(null)
      // SECURITY FIX (Issue #164): Check blacklist (null-safe)
    ]);
    const storageDuration = Date.now() - storageStartTime;
    console.log(
      `[${jobId}] \u{1F4CA} Storage reads took ${storageDuration}ms (token source: ${tokenSource})`
    );
    if (blacklistEntry) {
      console.warn(
        `[${jobId}] \u{1F6AB} WebSocket authentication failed - token blacklisted`,
        {
          reason: blacklistEntry.reason,
          invalidatedAt: new Date(blacklistEntry.invalidatedAt).toISOString()
        }
      );
      return new Response("Token invalidated - job completed or failed", {
        status: 401,
        headers: {
          ...getCorsHeaders(request),
          "Content-Type": "text/plain"
        }
      });
    }
    let authSuccess = false;
    if (storedToken && providedToken && storedToken === providedToken) {
      authSuccess = true;
    } else if (providedToken) {
      const oldTokenExpiration = await this.storage.get(
        `oldAuthToken:${providedToken}`
      );
      if (oldTokenExpiration) {
        authSuccess = true;
        console.log(
          `[${jobId}] \u2705 Reconnection successful using recently expired token (grace period)`
        );
      }
    }
    if (!authSuccess) {
      console.warn(
        `[${jobId}] WebSocket authentication failed - invalid token`
      );
      return new Response("Unauthorized", {
        status: 401,
        headers: {
          ...getCorsHeaders(request),
          "Content-Type": "text/plain"
        }
      });
    }
    if (storedToken === providedToken && Date.now() > expiration) {
      console.warn(
        `[${jobId}] WebSocket authentication failed - token expired`
      );
      return new Response("Token expired", {
        status: 401,
        headers: {
          ...getCorsHeaders(request),
          "Content-Type": "text/plain"
        }
      });
    }
    console.log(`[${jobId}] \u2705 WebSocket authentication successful`);
    const pairStartTime = Date.now();
    console.log(`[ProgressDO] Creating WebSocket for job ${jobId}`);
    if (this.webSocket && !isReconnect) {
      console.warn(
        `[${jobId}] \u{1F6AB} Rejecting new connection - token already has active WebSocket`
      );
      const [rejectedClient, rejectedServer] = Object.values(
        new WebSocketPair()
      );
      rejectedServer.accept();
      rejectedServer.close(
        1008,
        // POLICY_VIOLATION close code
        "Token already in use with an active connection. Use reconnect=true to reconnect."
      );
      return new Response(null, {
        status: 101,
        webSocket: rejectedClient,
        headers: getCorsHeaders(request)
      });
    }
    if (this.webSocket && isReconnect) {
      console.log(`[${jobId}] Closing old WebSocket connection for reconnect`);
      try {
        this.webSocket.close(
          WebSocketCloseCodes.NORMAL_CLOSURE,
          "Client reconnecting"
        );
      } catch (error3) {
        console.warn(`[${jobId}] Error closing old WebSocket:`, error3.message);
      }
      this.webSocket = null;
      this.isReady = false;
      this.readyPromise = null;
      this.readyResolver = null;
    }
    const [client, server] = Object.values(new WebSocketPair());
    const pairDuration = Date.now() - pairStartTime;
    this.webSocket = server;
    this.jobId = jobId;
    const acceptStartTime = Date.now();
    this.webSocket.accept();
    const acceptDuration = Date.now() - acceptStartTime;
    this.readyPromise = new Promise((resolve) => {
      this.readyResolver = resolve;
    });
    const totalUpgradeDuration = Date.now() - upgradeStartTime;
    console.log(
      `[${this.jobId}] WebSocket connection accepted, waiting for ready signal`
    );
    console.log(`[${this.jobId}] \u{1F4CA} WebSocket upgrade timing:`, {
      storageDuration: `${storageDuration}ms`,
      pairCreation: `${pairDuration}ms`,
      accept: `${acceptDuration}ms`,
      totalUpgrade: `${totalUpgradeDuration}ms`
    });
    const jobType = await this.storage.get("jobType");
    if (!jobType) {
      await this.scheduleTokenRefreshCheck();
    } else {
      console.log(
        `[${this.jobId}] Job type '${jobType}' pending, skipping initial token refresh schedule`
      );
    }
    this.webSocket.addEventListener("message", (event) => {
      console.log(`[${this.jobId}] Received message:`, event.data);
      try {
        const msg = JSON.parse(event.data);
        if (!msg || typeof msg !== "object") {
          console.warn(
            `[${this.jobId}] Protocol error: Invalid message structure (not an object)`
          );
          this.webSocket.close(
            WebSocketCloseCodes.PROTOCOL_ERROR,
            "Invalid message format"
          );
          this.cleanup();
          return;
        }
        if (!msg.type || typeof msg.type !== "string") {
          console.warn(
            `[${this.jobId}] Protocol error: Missing or invalid 'type' field`,
            msg
          );
          this.webSocket.close(
            WebSocketCloseCodes.PROTOCOL_ERROR,
            "Missing message type"
          );
          this.cleanup();
          return;
        }
        if (msg.type === "ready") {
          console.log(`[${this.jobId}] \u2705 Client ready signal received`);
          this.isReady = true;
          if (this.readyResolver) {
            this.readyResolver();
            this.readyResolver = null;
          }
          this.webSocket.send(
            JSON.stringify({
              type: "ready_ack",
              jobId: this.jobId,
              pipeline: this.currentPipeline,
              timestamp: Date.now(),
              version: "1.0.0",
              payload: {
                type: "ready_ack",
                timestamp: Date.now()
              }
            })
          );
        } else {
          console.warn(
            `[${this.jobId}] Protocol error: Unknown message type '${msg.type}'`
          );
          this.webSocket.close(
            WebSocketCloseCodes.PROTOCOL_ERROR,
            `Unknown message type: ${msg.type}`
          );
          this.cleanup();
        }
      } catch (error3) {
        console.error(
          `[${this.jobId}] Protocol error: Failed to parse message`,
          error3
        );
        this.webSocket.close(
          WebSocketCloseCodes.PROTOCOL_ERROR,
          "Invalid JSON"
        );
        this.cleanup();
      }
    });
    this.webSocket.addEventListener("close", (event) => {
      console.log(
        `[${this.jobId}] WebSocket closed:`,
        event.code,
        event.reason
      );
      this.storage.put("lastDisconnect", Date.now());
      this.storage.put("lastDisconnectCode", event.code);
      this.storage.put("lastDisconnectReason", event.reason || "Unknown");
      if (event.code === WebSocketCloseCodes.NORMAL_CLOSURE) {
        console.log(`[${this.jobId}] Normal closure - cleaning up immediately`);
        this.cleanup();
      } else {
        console.log(
          `[${this.jobId}] Unexpected disconnect (code ${event.code}) - 60s reconnection grace period`
        );
        this.cleanupInMemoryOnly();
      }
    });
    this.webSocket.addEventListener("error", (event) => {
      console.error(`[${this.jobId}] WebSocket error:`, event);
      this.cleanupInMemoryOnly();
    });
    if (isReconnect) {
      const jobState = await this.storage.get("jobState");
      if (jobState) {
        console.log(
          `[${jobId}] Sending reconnection confirmation with current progress`
        );
        this.webSocket.send(
          JSON.stringify({
            type: "reconnected",
            jobId: this.jobId,
            pipeline: jobState.pipeline || this.currentPipeline,
            timestamp: Date.now(),
            version: "1.0.0",
            payload: {
              type: "reconnected",
              progress: jobState.progress || 0,
              status: jobState.status || "processing",
              processedCount: jobState.processedCount || 0,
              totalCount: jobState.totalCount || 0,
              lastUpdate: jobState.lastUpdate || Date.now(),
              message: "Reconnected successfully - resuming job progress"
            }
          })
        );
      } else {
        console.warn(
          `[${jobId}] Reconnection requested but no job state found`
        );
      }
    }
    const headers = getCorsHeaders(request);
    if (tokenSource === "subprotocol") {
      headers["Sec-WebSocket-Protocol"] = "bookstrack-auth";
    }
    return new Response(null, {
      status: 101,
      webSocket: client,
      headers
    });
  }
  /**
   * RPC Method: Set authentication token for WebSocket connection
   * Called by handlers before starting background processing
   *
   * @param {string} token - Authentication token (UUID)
   * @returns {Promise<{success: boolean}>}
   */
  async setAuthToken(token) {
    await this.storage.put("authToken", token);
    await this.storage.put(
      "authTokenExpiration",
      Date.now() + 2 * 60 * 60 * 1e3
    );
    console.log(
      `[${this.jobId || "unknown"}] Auth token set (expires in 2 hours)`
    );
    return { success: true };
  }
  /**
   * RPC Method: Refresh authentication token
   * Called by iOS client to extend token expiration for long-running jobs
   *
   * Security: Enforces 30-minute refresh window to prevent infinite token extension
   * Tokens can only be refreshed in the last 30 minutes before expiration
   *
   * @param {string} oldToken - Current token to validate
   * @returns {Promise<{token?: string, expiresIn?: number, error?: string}>}
   */
  async refreshAuthToken(oldToken) {
    if (this.refreshInProgress) {
      console.warn(
        `[${this.jobId || "unknown"}] Token refresh already in progress`
      );
      return { error: "Refresh in progress, please retry shortly" };
    }
    this.refreshInProgress = true;
    try {
      const storedToken = await this.storage.get("authToken");
      const expiration = await this.storage.get("authTokenExpiration");
      if (!storedToken || !oldToken || storedToken !== oldToken) {
        console.warn(
          `[${this.jobId || "unknown"}] Token refresh failed - invalid token`
        );
        return { error: "Invalid token" };
      }
      if (Date.now() > expiration) {
        console.warn(
          `[${this.jobId || "unknown"}] Token refresh failed - token expired`
        );
        return { error: "Token expired" };
      }
      const REFRESH_WINDOW_MS = 30 * 60 * 1e3;
      const timeUntilExpiration = expiration - Date.now();
      if (timeUntilExpiration > REFRESH_WINDOW_MS) {
        const minutesRemaining = Math.floor(timeUntilExpiration / 6e4);
        console.warn(
          `[${this.jobId || "unknown"}] Token refresh too early - ${minutesRemaining} minutes remaining`
        );
        return {
          error: "Refresh not allowed yet",
          details: `Token can be refreshed ${Math.floor((timeUntilExpiration - REFRESH_WINDOW_MS) / 6e4)} minutes from now`
        };
      }
      const TOKEN_EXPIRATION_MS = 2 * 60 * 60 * 1e3;
      const newToken = crypto.randomUUID();
      const newExpiration = Date.now() + TOKEN_EXPIRATION_MS;
      await this.storage.put("authToken", newToken);
      await this.storage.put("authTokenExpiration", newExpiration);
      console.log(
        `[${this.jobId || "unknown"}] \u2705 Token refreshed successfully (expires in 2 hours)`
      );
      return {
        token: newToken,
        expiresIn: 7200
        // 2 hours in seconds
      };
    } finally {
      this.refreshInProgress = false;
    }
  }
  /**
   * RPC Method: Invalidate authentication token
   * Called automatically by completeJobState() and failJobState()
   *
   * Security (Issue #164): Immediately blacklist token on job completion/failure
   * to prevent token reuse. Tokens remain blacklisted for 2.5 hours (longer than
   * the 2-hour expiration) to ensure leaked tokens can't reconnect to completed jobs.
   *
   * Implementation:
   * 1. Retrieve current authToken from storage
   * 2. Add to blacklist with TTL (auto-cleanup by Cloudflare)
   * 3. Delete authToken and expiration from storage
   * 4. Log security event for audit trail
   *
   * @returns {Promise<{success: boolean}>}
   */
  async invalidateAuthToken() {
    const token = await this.storage.get("authToken");
    if (!token) {
      console.warn(
        `[${this.jobId || "unknown"}] No token to invalidate (already cleaned up)`
      );
      return { success: true };
    }
    await this.storage.put(
      `blacklistedToken:${token}`,
      {
        invalidatedAt: Date.now(),
        reason: "Job completed or failed",
        jobId: this.jobId
      },
      { expirationTtl: BLACKLIST_TTL_SECONDS }
    );
    const oldTokenKeys = await this.storage.list({ prefix: "oldAuthToken:" });
    if (oldTokenKeys.size > 0) {
      const now = Date.now();
      const blacklistPuts = {};
      const oldTokenKeysToDelete = [];
      for (const key of oldTokenKeys.keys()) {
        if (key.startsWith("oldAuthToken:")) {
          const oldTokenValue = key.slice("oldAuthToken:".length);
          blacklistPuts[`blacklistedToken:${oldTokenValue}`] = {
            invalidatedAt: now,
            reason: "Job completed or failed",
            jobId: this.jobId
          };
          oldTokenKeysToDelete.push(key);
        } else {
          console.warn(
            `[${this.jobId || "unknown"}] Unexpected old token key format: ${key}`
          );
        }
      }
      await this.storage.put(blacklistPuts, {
        expirationTtl: BLACKLIST_TTL_SECONDS
      });
      await this.storage.delete(oldTokenKeysToDelete);
      console.log(
        `[${this.jobId || "unknown"}] Blacklisted and deleted ${oldTokenKeysToDelete.length} old token(s)`
      );
    }
    await this.storage.delete(["authToken", "authTokenExpiration"]);
    console.log(
      `[${this.jobId || "unknown"}] \u2705 Auth token invalidated and blacklisted (TTL: 2.5 hours)`
    );
    return { success: true };
  }
  /**
   * AUTOMATIC TOKEN REFRESH: Schedule periodic check for token expiration
   *
   * This method implements the automatic token refresh promised in API_CONTRACT.md.
   * Uses Durable Object alarms to periodically check token expiration and refresh
   * when within 30 minutes of expiry, ensuring active WebSocket connections never
   * experience authentication failures.
   *
   * Implementation:
   * - Schedules alarm for next check time (15 minutes from now)
   * - Alarm handler checks if token needs refresh (within 30min window)
   * - Automatically extends token by 2 hours if needed
   * - Reschedules next check
   *
   * @returns {Promise<void>}
   */
  async scheduleTokenRefreshCheck() {
    const expiration = await this.storage.get("authTokenExpiration");
    if (!expiration) {
      console.warn(
        `[${this.jobId}] No token expiration found, skipping refresh check schedule`
      );
      return;
    }
    const now = Date.now();
    const timeUntilExpiration = expiration - now;
    const REFRESH_WINDOW_MS = 30 * 60 * 1e3;
    const CHECK_INTERVAL_MS = 15 * 60 * 1e3;
    if (timeUntilExpiration < REFRESH_WINDOW_MS && timeUntilExpiration > 0) {
      console.log(
        `[${this.jobId}] Token expires in ${Math.floor(timeUntilExpiration / 6e4)}min - refreshing automatically`
      );
      const refreshed = await this.autoRefreshToken();
      if (refreshed) {
        await this.scheduleTokenRefreshCheck();
        return;
      }
    }
    const refreshWindowStart = expiration - REFRESH_WINDOW_MS;
    let nextCheckTime = Math.min(
      now + CHECK_INTERVAL_MS,
      refreshWindowStart
      // Check at start of refresh window, not before
    );
    if (nextCheckTime <= now) {
      if (timeUntilExpiration > 0) {
        nextCheckTime = now + 1e3;
        console.log(
          `[${this.jobId}] Token expires soon, scheduling immediate check`
        );
      } else {
        console.log(
          `[${this.jobId}] Token already expired, skipping next check schedule`
        );
        return;
      }
    }
    const jobType = await this.storage.get("jobType");
    if (jobType) {
      const jobAlarmTime = now + 5e3;
      nextCheckTime = Math.max(nextCheckTime, jobAlarmTime);
      console.log(
        `[${this.jobId}] Job type '${jobType}' pending, scheduling token refresh after expected job start`
      );
    }
    if (nextCheckTime > now) {
      await this.storage.setAlarm(nextCheckTime);
      console.log(
        `[${this.jobId}] Token refresh check scheduled for ${new Date(nextCheckTime).toISOString()}`
      );
    }
  }
  /**
   * AUTOMATIC TOKEN REFRESH: Internal method to refresh token without client action
   *
   * Unlike refreshAuthToken() which requires client to provide oldToken,
   * this method is called automatically by the alarm handler and doesn't
   * require client interaction.
   *
   * @returns {Promise<boolean>} True if refresh succeeded
   */
  async autoRefreshToken() {
    if (this.refreshInProgress) {
      console.warn(
        `[${this.jobId}] Auto-refresh skipped - refresh already in progress`
      );
      return false;
    }
    this.refreshInProgress = true;
    try {
      const expiration = await this.storage.get("authTokenExpiration");
      const oldToken = await this.storage.get("authToken");
      const now = Date.now();
      if (now > expiration) {
        console.warn(
          `[${this.jobId}] Token already expired, cannot auto-refresh`
        );
        return false;
      }
      const REFRESH_WINDOW_MS = 30 * 60 * 1e3;
      const timeUntilExpiration = expiration - now;
      if (timeUntilExpiration > REFRESH_WINDOW_MS) {
        console.log(
          `[${this.jobId}] Token not yet eligible for refresh (${Math.floor(timeUntilExpiration / 6e4)}min remaining)`
        );
        return false;
      }
      const TOKEN_EXPIRATION_MS = 2 * 60 * 60 * 1e3;
      const newToken = crypto.randomUUID();
      const newExpiration = now + TOKEN_EXPIRATION_MS;
      await this.storage.put("authToken", newToken);
      await this.storage.put("authTokenExpiration", newExpiration);
      if (oldToken) {
        await this.storage.put(`oldAuthToken:${oldToken}`, true, {
          expirationTtl: 300
        });
        console.log(
          `[${this.jobId}] Old token stored with 5-minute grace period for reconnection`
        );
      }
      console.log(
        `[${this.jobId}] \u2705 Token automatically refreshed (expires in 2 hours)`
      );
      return true;
    } catch (error3) {
      console.error(`[${this.jobId}] Auto-refresh failed:`, error3);
      return false;
    } finally {
      this.refreshInProgress = false;
    }
  }
  // =============================================================================
  // State Persistence Methods (Day 3: WebSocket Enhancements)
  // =============================================================================
  /**
   * RPC Method: Initialize job state with pipeline configuration
   * Called by handlers when starting a background job
   *
   * @param {string} pipeline - Pipeline type (batch_enrichment, csv_import, ai_scan)
   * @param {number} totalCount - Total items to process
   * @returns {Promise<{success: boolean}>}
   */
  async initializeJobState(pipeline, totalCount) {
    this.currentPipeline = pipeline;
    const state = {
      pipeline,
      totalCount,
      processedCount: 0,
      status: "running",
      startTime: Date.now(),
      version: 1
    };
    await this.storage.put("jobState", state);
    this.lastPersistTime = Date.now();
    console.log(`[${this.jobId}] Job state initialized for ${pipeline}`);
    return { success: true };
  }
  /**
   * RPC Method: Update job state with throttling
   * Only persists every N updates or every T seconds (pipeline-specific)
   *
   * CRITICAL FIX (Issue #2): Throttle state now persisted to Durable Storage
   * to survive DO evictions and prevent lost state.
   *
   * @param {Object} updates - State updates (progress, processedCount, currentItem, etc.)
   * @returns {Promise<{success: boolean, persisted: boolean}>}
   */
  async updateJobState(updates) {
    if (!this.currentPipeline) {
      console.warn(
        `[${this.jobId}] Cannot update state: pipeline not initialized`
      );
      return { success: false, persisted: false };
    }
    const config2 = THROTTLE_CONFIG[this.currentPipeline];
    if (!config2) {
      console.error(
        `[${this.jobId}] Invalid pipeline: ${this.currentPipeline}`
      );
      throw new Error(
        `Invalid pipeline type: ${this.currentPipeline}. Valid types: ${Object.keys(THROTTLE_CONFIG).join(", ")}`
      );
    }
    const throttleState = await this.storage.get("throttleState") || {
      updatesSinceLastPersist: 0,
      lastPersistTime: Date.now()
    };
    throttleState.updatesSinceLastPersist++;
    const timeSinceLastPersist = Date.now() - throttleState.lastPersistTime;
    const shouldPersist = throttleState.updatesSinceLastPersist >= config2.updateCount || timeSinceLastPersist >= config2.timeSeconds * 1e3;
    if (shouldPersist) {
      const currentState = await this.storage.get("jobState") || {};
      const newState = {
        ...currentState,
        ...updates,
        lastUpdate: Date.now(),
        version: (currentState.version || 0) + 1
      };
      await this.storage.put({
        jobState: newState,
        throttleState: {
          updatesSinceLastPersist: 0,
          lastPersistTime: Date.now()
        }
      });
      this.updatesSinceLastPersist = 0;
      this.lastPersistTime = Date.now();
      console.log(
        `[${this.jobId}] State persisted (version ${newState.version})`
      );
      return { success: true, persisted: true };
    }
    await this.storage.put("throttleState", throttleState);
    return { success: true, persisted: false };
  }
  /**
   * RPC Method: Get current job state
   * Used by iOS client after reconnection to sync state
   *
   * @returns {Promise<Object|null>}
   */
  async getJobState() {
    const state = await this.storage.get("jobState");
    if (state) {
      console.log(
        `[${this.jobId}] State retrieved (version ${state.version || 0})`
      );
    }
    return state || null;
  }
  /**
   * RPC Method: Get job state with authentication details
   * Used by /api/job-state endpoint for secure state sync after reconnection
   *
   * @returns {Promise<{jobState: Object, authToken: string, authTokenExpiration: number}|null>}
   */
  async getJobStateAndAuth() {
    const [jobState, authToken, authTokenExpiration] = await Promise.all([
      this.storage.get("jobState"),
      this.storage.get("authToken"),
      this.storage.get("authTokenExpiration")
    ]);
    if (!jobState) {
      console.log(`[${this.jobId}] No job state found`);
      return null;
    }
    console.log(
      `[${this.jobId}] State and auth retrieved (version ${jobState.version || 0})`
    );
    return { jobState, authToken, authTokenExpiration };
  }
  /**
   * RPC Method: Complete job and finalize state
   * Called when job finishes successfully
   *
   * @param {Object} results - Final job results
   * @returns {Promise<{success: boolean}>}
   */
  async completeJobState(results) {
    const currentState = await this.storage.get("jobState") || {};
    const finalState = {
      ...currentState,
      status: "complete",
      endTime: Date.now(),
      results,
      version: (currentState.version || 0) + 1
    };
    await this.storage.put("jobState", finalState);
    console.log(`[${this.jobId}] Job state marked as complete`);
    await this.invalidateAuthToken();
    const cleanupTime = Date.now() + 24 * 60 * 60 * 1e3;
    await this.storage.setAlarm(cleanupTime);
    console.log(
      `[${this.jobId}] Cleanup alarm scheduled for ${new Date(cleanupTime).toISOString()}`
    );
    return { success: true };
  }
  /**
   * RPC Method: Mark job as failed
   *
   * @param {Object} error - Error details
   * @returns {Promise<{success: boolean}>}
   */
  async failJobState(error3) {
    const currentState = await this.storage.get("jobState") || {};
    const finalState = {
      ...currentState,
      status: "failed",
      endTime: Date.now(),
      error: error3,
      version: (currentState.version || 0) + 1
    };
    await this.storage.put("jobState", finalState);
    console.log(`[${this.jobId}] Job state marked as failed`);
    await this.invalidateAuthToken();
    const cleanupTime = Date.now() + 24 * 60 * 60 * 1e3;
    await this.storage.setAlarm(cleanupTime);
    console.log(
      `[${this.jobId}] Cleanup alarm scheduled for ${new Date(cleanupTime).toISOString()}`
    );
    return { success: true };
  }
  // NOTE: Alarm handler is defined below at line 852 (consolidated version)
  /**
   * RPC Method: Push progress update to connected client
   * Called by background workers (enrichment, CSV import, etc.)
   */
  async pushProgress(progressData) {
    const isCanceled = await this.storage.get("status") === "canceled";
    if (isCanceled) {
      console.warn(
        `[${this.jobId}] Job is canceled, dropping progress message.`
      );
      throw new Error("Job canceled by client");
    }
    console.log(`[ProgressDO] pushProgress called for job ${this.jobId}`, {
      hasWebSocket: !!this.webSocket,
      progressData
    });
    if (!this.webSocket) {
      const error3 = new Error("No WebSocket connection available");
      console.error(`[${this.jobId}] No WebSocket connection`, { error: error3 });
      throw error3;
    }
    const message = JSON.stringify({
      type: "progress",
      jobId: this.jobId,
      timestamp: Date.now(),
      data: progressData
    });
    try {
      this.webSocket.send(message);
      console.log(`[${this.jobId}] Progress sent successfully`, {
        messageLength: message.length
      });
      return { success: true };
    } catch (error3) {
      console.error(`[${this.jobId}] Failed to send message:`, error3);
      throw error3;
    }
  }
  /**
   * RPC Method: Wait for client to send ready signal
   * Called by background processing before starting work
   *
   * @param {number} timeoutMs - Maximum time to wait (default 5000ms)
   * @returns {Promise<{success: boolean, timedOut?: boolean, disconnected?: boolean}>}
   */
  async waitForReady(timeoutMs = 5e3) {
    console.log(
      `[${this.jobId}] waitForReady called (timeout: ${timeoutMs}ms)`
    );
    if (this.isReady) {
      console.log(`[${this.jobId}] Client already ready`);
      return { success: true };
    }
    if (!this.webSocket) {
      console.warn(
        `[${this.jobId}] \u26A0\uFE0F WebSocket is null, cannot wait for ready`
      );
      return { success: false, disconnected: true };
    }
    const timeoutPromise = new Promise((resolve) => {
      setTimeout(() => {
        resolve({ success: false, timedOut: true });
      }, timeoutMs);
    });
    const disconnectPromise = new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (!this.webSocket) {
          clearInterval(checkInterval);
          resolve({ success: false, disconnected: true });
        }
      }, 100);
    });
    const readyResult = await Promise.race([
      this.readyPromise.then(() => ({ success: true })),
      timeoutPromise,
      disconnectPromise
    ]);
    if (readyResult.timedOut) {
      console.warn(`[${this.jobId}] \u26A0\uFE0F Ready timeout after ${timeoutMs}ms`);
    } else if (readyResult.disconnected) {
      console.warn(
        `[${this.jobId}] \u26A0\uFE0F WebSocket disconnected while waiting for ready`
      );
    } else {
      console.log(`[${this.jobId}] \u2705 Ready signal received`);
    }
    return readyResult;
  }
  /**
   * NEW RPC Method: Cancel the job and close the connection
   * Called by iOS client during library reset or explicit cancellation
   */
  async cancelJob(reason = "Job canceled by user") {
    console.log(`[${this.jobId}] Received cancelJob request`);
    await this.storage.put("status", "canceled");
    if (this.webSocket) {
      this.webSocket.close(WebSocketCloseCodes.GOING_AWAY, reason);
    }
    this.cleanup();
    return { success: true, status: "canceled" };
  }
  /**
   * NEW RPC Method: Check if the job has been canceled
   * Called by enrichment.js worker in processing loop
   */
  async isCanceled() {
    const status = await this.storage.get("status");
    return status === "canceled";
  }
  /**
   * RPC Method: Close WebSocket connection
   */
  async closeConnection(reason = "Job completed") {
    if (this.webSocket) {
      this.webSocket.close(WebSocketCloseCodes.NORMAL_CLOSURE, reason);
      this.cleanup();
    }
    return { success: true };
  }
  // =============================================================================
  // WebSocket RPC Methods (Unified Schema v1.0.0)
  // =============================================================================
  //
  // All WebSocket messages follow the unified schema defined in types/websocket-messages.ts
  // Legacy v1 methods (updateProgress, complete, fail) have been removed.
  // See types/websocket-messages.ts for complete message type definitions.
  //
  /**
   * RPC Method: Send job_started message
   *
   * @param {string} pipeline - Pipeline type ('batch_enrichment', 'csv_import', 'ai_scan')
   * @param {Object} payload - Job started payload (totalCount, estimatedDuration)
   * @returns {Promise<{success: boolean}>}
   */
  async sendJobStarted(pipeline, payload) {
    if (!this.webSocket) {
      console.warn(`[${this.jobId}] No WebSocket connection available`);
      return { success: false };
    }
    const message = {
      type: "job_started",
      jobId: this.jobId,
      pipeline,
      timestamp: Date.now(),
      version: "1.0.0",
      payload: {
        type: "job_started",
        ...payload
      }
    };
    try {
      const messageStr = JSON.stringify(message);
      this.validateMessageSize(messageStr);
      this.webSocket.send(messageStr);
      console.log(`[${this.jobId}] Job started message sent`);
      return { success: true };
    } catch (error3) {
      console.error(`[${this.jobId}] Failed to send job_started:`, error3);
      return { success: false };
    }
  }
  /**
   * RPC Method: Send job_progress message
   *
   * @param {string} pipeline - Pipeline type
   * @param {Object} payload - Progress payload (progress, status, processedCount, currentItem, keepAlive)
   * @returns {Promise<{success: boolean}>}
   */
  async updateProgress(pipeline, payload) {
    if (!this.webSocket) {
      console.warn(`[${this.jobId}] No WebSocket connection available`);
      return { success: false };
    }
    const message = {
      type: "job_progress",
      jobId: this.jobId,
      pipeline,
      timestamp: Date.now(),
      version: "1.0.0",
      payload: {
        type: "job_progress",
        ...payload
      }
    };
    try {
      const messageStr = JSON.stringify(message);
      this.validateMessageSize(messageStr);
      this.webSocket.send(messageStr);
      if (!payload.keepAlive) {
        console.log(
          `[${this.jobId}] Progress update sent: ${payload.progress}`
        );
      }
      return { success: true };
    } catch (error3) {
      console.error(`[${this.jobId}] Failed to send job_progress:`, error3);
      return { success: false };
    }
  }
  /**
   * RPC Method: Send job_complete message
   *
   * @param {string} pipeline - Pipeline type
   * @param {Object} payload - Completion payload (pipeline-specific)
   * @returns {Promise<{success: boolean}>}
   */
  async complete(pipeline, payload) {
    if (!this.webSocket) {
      console.warn(`[${this.jobId}] No WebSocket connection available`);
      return { success: false };
    }
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1e3).toISOString();
    const message = {
      type: "job_complete",
      jobId: this.jobId,
      pipeline,
      timestamp: Date.now(),
      version: "1.0.0",
      payload: {
        type: "job_complete",
        pipeline,
        ...payload,
        expiresAt
        // Add expiry timestamp to payload
      }
    };
    try {
      const messageStr = JSON.stringify(message);
      this.validateMessageSize(messageStr);
      this.webSocket.send(messageStr);
      console.log(`[${this.jobId}] Job complete message sent`);
      setTimeout(() => {
        if (this.webSocket) {
          this.webSocket.close(
            WebSocketCloseCodes.NORMAL_CLOSURE,
            "Job completed"
          );
          this.cleanup();
        }
      }, 1e3);
      return { success: true };
    } catch (error3) {
      console.error(`[${this.jobId}] Failed to send job_complete:`, error3);
      return { success: false };
    }
  }
  /**
   * RPC Method: Send error message (v2 schema)
   *
   * @param {string} pipeline - Pipeline type
   * @param {Object} payload - Error payload (code, message, details, retryable)
   * @returns {Promise<{success: boolean}>}
   */
  async sendError(pipeline, payload) {
    if (!this.webSocket) {
      console.warn(`[${this.jobId}] No WebSocket connection available`);
      return { success: false };
    }
    const message = {
      type: "error",
      jobId: this.jobId,
      pipeline,
      timestamp: Date.now(),
      version: "2.0.0",
      // Bumped to 2.0.0 for breaking change
      payload: {
        type: "error",
        data: null,
        // Always null for errors (matches HTTP ResponseEnvelope)
        metadata: {
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
          // ISO 8601 format (matches HTTP)
        },
        error: {
          message: payload.message,
          code: payload.code,
          details: payload.details
        },
        retryable: payload.retryable
        // WebSocket-specific extension
      }
    };
    try {
      const messageStr = JSON.stringify(message);
      this.validateMessageSize(messageStr);
      this.webSocket.send(messageStr);
      console.log(
        `[${this.jobId}] Error message sent (v2 schema): ${payload.code}`
      );
      setTimeout(() => {
        if (this.webSocket) {
          this.webSocket.close(
            WebSocketCloseCodes.INTERNAL_ERROR,
            "Job failed"
          );
          this.cleanup();
        }
      }, 1e3);
      return { success: true };
    } catch (error3) {
      console.error(`[${this.jobId}] Failed to send error:`, error3);
      return { success: false };
    }
  }
  /**
   * ISSUE #135: Validate WebSocket message size
   * Cloudflare WebSocket limit: 32 MiB per message
   *
   * @param {string} message - Serialized JSON message
   * @throws {Error} If message exceeds 32 MiB limit
   */
  validateMessageSize(message) {
    const sizeBytes = new Blob([message]).size;
    const sizeMB = sizeBytes / (1024 * 1024);
    const MAX_SIZE_MB = 32;
    if (sizeMB > MAX_SIZE_MB) {
      const error3 = `WebSocket message too large: ${sizeMB.toFixed(2)} MB (max ${MAX_SIZE_MB} MB)`;
      console.error(`[${this.jobId}] ${error3}`);
      throw new Error(error3);
    }
    if (sizeMB > 10) {
      console.warn(
        `[${this.jobId}] \u26A0\uFE0F Large WebSocket message: ${sizeMB.toFixed(2)} MB (consider using summary-only pattern)`
      );
    }
    return sizeMB;
  }
  /**
   * Internal cleanup - Full cleanup including storage
   */
  async cleanup() {
    this.webSocket = null;
    this.jobId = null;
    this.isReady = false;
    this.readyPromise = null;
    this.readyResolver = null;
    await this.storage.delete("authToken");
    await this.storage.delete("authTokenExpiration");
    console.log("[ProgressDO] Cleanup complete");
  }
  /**
   * RECONNECTION SUPPORT (Issue #127): Cleanup in-memory state only
   * Preserves auth tokens and job state in storage to allow reconnection
   */
  cleanupInMemoryOnly() {
    this.webSocket = null;
    this.isReady = false;
    this.readyPromise = null;
    this.readyResolver = null;
    console.log(
      `[${this.jobId}] In-memory cleanup complete (storage preserved for reconnection)`
    );
  }
  /**
   * RPC Method: Schedule CSV processing via Durable Object alarm
   * Called by csv-import.js to avoid ctx.waitUntil() timeout
   *
   * @param {string} csvText - Raw CSV file content
   * @param {string} jobId - Job identifier
   * @returns {Promise<{success: boolean}>}
   */
  async scheduleCSVProcessing(csvText, jobId) {
    console.log(`[${jobId}] Scheduling CSV processing via alarm`);
    await this.storage.put("csvData", csvText);
    await this.storage.put("jobId", jobId);
    await this.storage.put("jobType", "csv-import");
    const alarmTime = Date.now() + 2e3;
    await this.storage.setAlarm(alarmTime);
    console.log(
      `[${jobId}] CSV processing alarm scheduled for ${new Date(alarmTime).toISOString()}`
    );
    return { success: true };
  }
  /**
   * RPC Method: Schedule bookshelf scan processing via Durable Object alarm
   * Called by index.js to avoid Worker CPU time limits for long AI operations
   *
   * @param {ArrayBuffer} imageData - Raw image data
   * @param {string} jobId - Job identifier
   * @param {Object} requestHeaders - Headers from original request
   * @returns {Promise<{success: boolean}>}
   */
  async scheduleBookshelfScan(imageData, jobId, requestHeaders) {
    console.log(`[${jobId}] Scheduling bookshelf scan via alarm`);
    await this.storage.put("imageData", imageData);
    await this.storage.put("requestHeaders", requestHeaders || {});
    await this.storage.put("jobId", jobId);
    await this.storage.put("jobType", "bookshelf-scan");
    const alarmTime = Date.now() + 2e3;
    await this.storage.setAlarm(alarmTime);
    console.log(
      `[${jobId}] Bookshelf scan alarm scheduled for ${new Date(alarmTime).toISOString()}`
    );
    return { success: true };
  }
  /**
   * Alarm handler: Process long-running background jobs or cleanup
   * Runs outside Worker CPU time limits (5min for HTTP, 15min for alarms)
   *
   * Handles four types of alarms:
   * 1. Token Refresh Check - Dynamic alarm scheduled by scheduleTokenRefreshCheck() based on token expiration time
   * 2. CSV Import Processing - jobType='csv-import', scheduled 2s after upload
   * 3. Bookshelf Scan Processing - jobType='bookshelf-scan', scheduled 2s after upload
   * 4. State Cleanup - No jobType, scheduled 24h after job completion
   */
  async alarm() {
    const jobType = await this.storage.get("jobType");
    const jobId = await this.storage.get("jobId");
    const logId = this.jobId || jobId || this.state.id.toString();
    const expiration = await this.storage.get("authTokenExpiration");
    if (expiration && !jobType) {
      console.log(`[${logId}] Alarm triggered for token refresh check`);
      const refreshed = await this.autoRefreshToken();
      if (refreshed || Date.now() < expiration) {
        await this.scheduleTokenRefreshCheck();
      } else {
        console.log(
          `[${logId}] Token expired, no further refresh checks scheduled`
        );
      }
      return;
    }
    if (jobType === "csv-import") {
      console.log(`[${logId}] Alarm triggered for CSV import processing`);
      await this.processCSVImportAlarm();
    } else if (jobType === "bookshelf-scan") {
      console.log(`[${logId}] Alarm triggered for bookshelf scan processing`);
      await this.processBookshelfScanAlarm();
    } else {
      console.log(`[${logId}] Cleanup alarm triggered - removing old state`);
      await this.storage.delete("jobState");
      await this.storage.delete("authToken");
      await this.storage.delete("authTokenExpiration");
      const oldTokenKeys = await this.storage.list({ prefix: "oldAuthToken:" });
      if (oldTokenKeys.size > 0) {
        await this.storage.delete(Array.from(oldTokenKeys.keys()));
        console.log(`[${logId}] Cleaned up ${oldTokenKeys.size} old token(s)`);
      }
      const BLACKLIST_TTL_MS = BLACKLIST_TTL_SECONDS * 1e3;
      let deletedCount = 0;
      let cursor;
      do {
        const listed = await this.storage.list({
          prefix: "blacklistedToken:",
          cursor,
          limit: 128
          // Process in batches to handle pagination
        });
        const keysToDelete = [];
        for (const [key, entry] of listed.entries()) {
          if (entry && Date.now() - entry.invalidatedAt > BLACKLIST_TTL_MS) {
            keysToDelete.push(key);
          }
        }
        if (keysToDelete.length > 0) {
          await this.storage.delete(keysToDelete);
          deletedCount += keysToDelete.length;
        }
        cursor = listed.cursor;
      } while (cursor);
      if (deletedCount > 0) {
        console.log(
          `[${logId}] Cleaned up ${deletedCount} expired blacklisted token(s)`
        );
      }
    }
  }
  /**
   * Process CSV import inside Durable Object alarm
   * No Worker CPU time limits apply in alarm context
   */
  async processCSVImportAlarm() {
    const csvText = await this.storage.get("csvData");
    const jobId = await this.storage.get("jobId");
    console.log(
      `[${jobId}] Starting CSV processing in alarm (no timeout limits)`
    );
    try {
      await processCSVImportCore(csvText, jobId, this, this.env);
      console.log(`[${jobId}] CSV processing completed successfully`);
      await this.storage.delete("csvData");
      await this.storage.delete("jobId");
      await this.storage.delete("jobType");
    } catch (error3) {
      console.error(`[${jobId}] CSV processing failed in alarm:`, error3);
      await this.sendError("csv_import", {
        code: "CSV_PROCESSING_ERROR",
        message: error3.message,
        details: {
          fallbackAvailable: true,
          suggestion: "Try manual CSV import instead"
        },
        retryable: true
      });
      await this.storage.delete("csvData");
      await this.storage.delete("jobId");
      await this.storage.delete("jobType");
    }
  }
  /**
   * Process bookshelf scan inside Durable Object alarm
   * No Worker CPU time limits apply in alarm context (can handle 20-60s AI processing)
   */
  async processBookshelfScanAlarm() {
    const imageData = await this.storage.get("imageData");
    const requestHeaders = await this.storage.get("requestHeaders");
    const jobId = await this.storage.get("jobId");
    console.log(
      `[${jobId}] Starting bookshelf scan in alarm (no CPU time limits)`
    );
    try {
      const mockRequest = {
        headers: {
          get: /* @__PURE__ */ __name((key) => requestHeaders[key] || null, "get")
        }
      };
      await processBookshelfScan(
        jobId,
        imageData,
        mockRequest,
        this.env,
        this,
        null
      );
      console.log(`[${jobId}] Bookshelf scan completed successfully`);
      await this.storage.delete("imageData");
      await this.storage.delete("requestHeaders");
      await this.storage.delete("jobId");
      await this.storage.delete("jobType");
    } catch (error3) {
      console.error(
        `[${jobId}] Bookshelf scan processing failed in alarm:`,
        error3
      );
      await this.sendError("ai_scan", {
        code: "BOOKSHELF_SCAN_ERROR",
        message: error3.message,
        details: {
          fallbackAvailable: false,
          suggestion: "Try uploading a clearer photo or contact support"
        },
        retryable: true
      });
      await this.storage.delete("imageData");
      await this.storage.delete("requestHeaders");
      await this.storage.delete("jobId");
      await this.storage.delete("jobType");
    }
  }
  /**
   * RPC Method: Initialize batch job with photo array
   * Called by batch-scan-handler.js when batch upload starts
   */
  async initBatch({ jobId, totalPhotos, status }) {
    console.log(`[ProgressDO] initBatch called for job ${jobId}`, {
      totalPhotos,
      status
    });
    if (typeof jobId !== "string" || jobId.trim().length === 0) {
      throw new Error("jobId must be a non-empty string");
    }
    if (typeof totalPhotos !== "number" || totalPhotos < 1 || totalPhotos > 5) {
      throw new Error("totalPhotos must be a number between 1 and 5");
    }
    await this.storage.delete("status");
    this.currentPipeline = "ai_scan";
    const photos = Array.from({ length: totalPhotos }, (_, i) => ({
      index: i,
      status: "queued",
      booksFound: 0
    }));
    const batchState = {
      jobId,
      type: "batch",
      totalPhotos,
      photos,
      overallStatus: status,
      currentPhoto: null,
      totalBooksFound: 0,
      cancelRequested: false
    };
    await this.storage.put("batchState", batchState);
    this.broadcastToClients({
      type: "batch-init",
      // No longer need top-level jobId, it's added by broadcastToClients
      totalPhotos,
      status
    });
    return { success: true };
  }
  /**
   * RPC Method: Update photo status in batch
   * Called by batch-scan-handler.js after each photo processes
   */
  async updatePhoto({ photoIndex, status, booksFound, error: error3 }) {
    console.log(`[ProgressDO] updatePhoto called`, {
      photoIndex,
      status,
      booksFound,
      error: error3
    });
    if (typeof photoIndex !== "number") {
      throw new Error("photoIndex must be a number");
    }
    const batchState = await this.storage.get("batchState");
    if (!batchState || batchState.type !== "batch") {
      console.error("[ProgressDO] Batch job not found");
      return { error: "Batch job not found" };
    }
    if (photoIndex < 0 || photoIndex >= batchState.photos.length) {
      return { error: `Invalid photo index: ${photoIndex}` };
    }
    batchState.photos[photoIndex].status = status;
    if (booksFound !== void 0) {
      batchState.photos[photoIndex].booksFound = booksFound;
    }
    if (error3) {
      batchState.photos[photoIndex].error = error3;
    }
    if (status === "processing") {
      batchState.currentPhoto = photoIndex;
    }
    batchState.totalBooksFound = batchState.photos.reduce(
      (sum, p) => sum + (p.booksFound || 0),
      0
    );
    await this.storage.put("batchState", batchState);
    this.broadcastToClients({
      type: "batch-progress",
      currentPhoto: photoIndex,
      totalPhotos: batchState.totalPhotos,
      photoStatus: status,
      booksFound: booksFound || 0,
      totalBooksFound: batchState.totalBooksFound,
      photos: batchState.photos
    });
    return { success: true };
  }
  /**
   * RPC Method: Complete batch processing
   * Called by batch-scan-handler.js when all photos are processed
   */
  async completeBatch({ status, totalBooks, photoResults, books }) {
    console.log(`[ProgressDO] completeBatch called`, { status, totalBooks });
    if (typeof totalBooks !== "number") {
      throw new Error("totalBooks must be a number");
    }
    const batchState = await this.storage.get("batchState");
    if (!batchState) {
      console.error("[ProgressDO] Job not found");
      return { error: "Job not found" };
    }
    batchState.overallStatus = status || "complete";
    batchState.totalBooksFound = totalBooks;
    batchState.finalResults = books;
    await this.storage.put("batchState", batchState);
    this.broadcastToClients({
      type: "batch-complete",
      totalBooks,
      photoResults,
      books
    });
    return { success: true };
  }
  /**
   * RPC Method: Get current batch state
   * Called by test endpoints to verify state
   */
  async getState() {
    const batchState = await this.storage.get("batchState");
    return batchState || {};
  }
  /**
   * RPC Method: Check if batch has been canceled
   * Called by batch-scan-handler.js in processing loop
   */
  async isBatchCanceled() {
    const batchState = await this.storage.get("batchState");
    return { canceled: batchState?.cancelRequested || false };
  }
  /**
   * RPC Method: Cancel batch processing
   * Called by iOS client or test endpoints
   */
  async cancelBatch() {
    console.log(`[ProgressDO] cancelBatch called`);
    const batchState = await this.storage.get("batchState");
    if (!batchState) {
      return { error: "Job not found" };
    }
    batchState.cancelRequested = true;
    batchState.overallStatus = "canceling";
    await this.storage.put("batchState", batchState);
    this.broadcastToClients({
      type: "batch-canceling"
    });
    return { success: true };
  }
  /**
   * Helper: Broadcast message to all connected WebSocket clients
   *
   * FIX (Issue #TBD): Align with API_CONTRACT.md unified schema
   * - Changed "data" to "payload" to match canonical envelope format
   * - Added missing "pipeline" and "version" fields required by contract
   * - Fixes iOS parsing failures in batch scan workflows
   */
  broadcastToClients(data) {
    if (!this.webSocket) {
      console.warn("[ProgressDO] No WebSocket connection to broadcast to");
      return;
    }
    try {
      const message = {
        type: data.type || "progress",
        jobId: this.jobId,
        pipeline: this.currentPipeline || "ai_scan",
        // Required by API contract
        timestamp: Date.now(),
        version: "1.0.0",
        // Required by API contract
        payload: {
          // Changed from "data" to "payload" per API_CONTRACT.md:762-774
          type: data.type,
          ...data
        }
      };
      this.webSocket.send(JSON.stringify(message));
      console.log(`[ProgressDO] Broadcast sent:`, message.type);
    } catch (error3) {
      console.error("[ProgressDO] Failed to send to client:", error3);
    }
  }
};

// src/durable-objects/rate-limiter.js
import { DurableObject as DurableObject2 } from "cloudflare:workers";
var RATE_LIMIT_WINDOW = 60;
var DEFAULT_RATE_LIMIT = 10;
var RateLimiterDO = class extends DurableObject2 {
  static {
    __name(this, "RateLimiterDO");
  }
  constructor(state, env2) {
    super(state, env2);
    this.state = state;
  }
  /**
   * Check if request is allowed and atomically increment counter.
   *
   * This is the core atomic operation that fixes the race condition.
   * No concurrent requests can both pass the check - serialization guaranteed by DO.
   *
   * UPDATE (Issue #222): Now accepts custom maxRequests per endpoint.
   *
   * @param {number} maxRequests - Maximum requests allowed in the window (endpoint-specific)
   * @returns {Promise<{allowed: boolean, remaining: number, resetAt: number}>}
   */
  async checkAndIncrement(maxRequests = DEFAULT_RATE_LIMIT) {
    const now = Date.now();
    const counters = await this.state.storage.get("counters") || {
      count: 0,
      resetAt: now + RATE_LIMIT_WINDOW * 1e3
    };
    if (now >= counters.resetAt) {
      counters.count = 0;
      counters.resetAt = now + RATE_LIMIT_WINDOW * 1e3;
    }
    const allowed = counters.count < maxRequests;
    if (allowed) {
      counters.count++;
      await this.state.storage.put("counters", counters);
    }
    const remaining = Math.max(0, maxRequests - counters.count);
    return {
      allowed,
      remaining,
      resetAt: counters.resetAt
    };
  }
  /**
   * Handle fetch requests from rate limiter middleware.
   * Expect POST to trigger checkAndIncrement and return result.
   *
   * UPDATE (Issue #222): Extracts X-Rate-Limit-Max header for endpoint-specific limits.
   */
  async fetch(request) {
    if (request.method === "POST") {
      const maxRequestsHeader = request.headers.get("X-Rate-Limit-Max");
      const maxRequests = maxRequestsHeader ? parseInt(maxRequestsHeader, 10) : DEFAULT_RATE_LIMIT;
      const result = await this.checkAndIncrement(maxRequests);
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    return new Response("Method not allowed", { status: 405 });
  }
};

// src/durable-objects/websocket-connection.js
import { DurableObject as DurableObject3 } from "cloudflare:workers";
var WebSocketConnectionDO = class extends DurableObject3 {
  static {
    __name(this, "WebSocketConnectionDO");
  }
  constructor(state, env2) {
    super(state, env2);
    this.storage = state.storage;
    this.webSocket = null;
    this.jobId = null;
    this.isReady = false;
    this.readyPromise = null;
    this.readyResolver = null;
  }
  /**
   * Handle WebSocket upgrade request
   *
   * @param {Request} request - Upgrade request with jobId and token
   * @returns {Promise<Response>} WebSocket upgrade response or error
   */
  async fetch(request) {
    const upgradeStartTime = Date.now();
    const url = new URL(request.url);
    const upgradeHeader = request.headers.get("Upgrade");
    console.log("[WebSocketConnectionDO] Incoming request", {
      url: url.toString(),
      upgradeHeader,
      method: request.method,
      timestamp: upgradeStartTime
    });
    if (!upgradeHeader || upgradeHeader !== "websocket") {
      console.warn("[WebSocketConnectionDO] Invalid upgrade header", {
        upgradeHeader
      });
      return new Response("Expected Upgrade: websocket", {
        status: 426,
        headers: {
          ...getCorsHeaders(request),
          "Content-Type": "text/plain"
        }
      });
    }
    const jobId = url.searchParams.get("jobId");
    if (!jobId) {
      console.error("[WebSocketConnectionDO] Missing jobId parameter");
      return new Response("Missing jobId parameter", {
        status: 400,
        headers: getCorsHeaders(request)
      });
    }
    const providedToken = url.searchParams.get("token");
    const storageStartTime = Date.now();
    const [storedToken, expiration] = await Promise.all([
      this.storage.get("authToken"),
      this.storage.get("authTokenExpiration")
    ]);
    const storageDuration = Date.now() - storageStartTime;
    console.log(`[${jobId}] Storage reads took ${storageDuration}ms`);
    const tokenConsumed = await this.storage.get("authTokenConsumed");
    if (tokenConsumed) {
      console.warn(
        `[${jobId}] WebSocket authentication failed - token already used (prevents session hijacking)`
      );
      return new Response(
        "Token already consumed. Only one connection per token is allowed.",
        {
          status: 401,
          headers: {
            ...getCorsHeaders(request),
            "Content-Type": "text/plain"
          }
        }
      );
    }
    if (!storedToken || !providedToken || storedToken !== providedToken) {
      console.warn(
        `[${jobId}] WebSocket authentication failed - invalid token`
      );
      return new Response("Unauthorized", {
        status: 401,
        headers: {
          ...getCorsHeaders(request),
          "Content-Type": "text/plain"
        }
      });
    }
    if (Date.now() > expiration) {
      console.warn(
        `[${jobId}] WebSocket authentication failed - token expired`
      );
      return new Response("Token expired", {
        status: 401,
        headers: {
          ...getCorsHeaders(request),
          "Content-Type": "text/plain"
        }
      });
    }
    await this.storage.put("authTokenConsumed", true);
    console.log(
      `[${jobId}] \u2705 WebSocket authentication successful (token now invalidated for reuse)`
    );
    const pairStartTime = Date.now();
    const [client, server] = Object.values(new WebSocketPair());
    const pairDuration = Date.now() - pairStartTime;
    this.webSocket = server;
    this.jobId = jobId;
    const acceptStartTime = Date.now();
    this.webSocket.accept();
    const acceptDuration = Date.now() - acceptStartTime;
    this.readyPromise = new Promise((resolve) => {
      this.readyResolver = resolve;
    });
    const totalUpgradeDuration = Date.now() - upgradeStartTime;
    console.log(
      `[${this.jobId}] WebSocket connection accepted, waiting for ready signal`
    );
    console.log(`[${this.jobId}] \u{1F4CA} WebSocket upgrade timing:`, {
      storageDuration: `${storageDuration}ms`,
      pairCreation: `${pairDuration}ms`,
      accept: `${acceptDuration}ms`,
      totalUpgrade: `${totalUpgradeDuration}ms`
    });
    this.webSocket.addEventListener("message", (event) => {
      this.handleMessage(event.data);
    });
    this.webSocket.addEventListener("close", (event) => {
      console.log(
        `[${this.jobId}] WebSocket closed:`,
        event.code,
        event.reason
      );
      this.cleanup();
    });
    this.webSocket.addEventListener("error", (event) => {
      console.error(`[${this.jobId}] WebSocket error:`, event);
      this.cleanup();
    });
    return new Response(null, {
      status: 101,
      webSocket: client,
      headers: getCorsHeaders(request)
    });
  }
  /**
   * Handle incoming WebSocket messages
   *
   * @param {string} data - Message data from client
   */
  handleMessage(data) {
    console.log(`[${this.jobId}] Received message:`, data);
    try {
      const msg = JSON.parse(data);
      if (!msg || typeof msg !== "object") {
        console.warn(
          `[${this.jobId}] Invalid message structure: not an object`
        );
        return;
      }
      if (!msg.type || typeof msg.type !== "string") {
        console.warn(
          `[${this.jobId}] Invalid message structure: missing or invalid 'type' field`,
          msg
        );
        return;
      }
      if (msg.type === "ready") {
        console.log(`[${this.jobId}] \u2705 Client ready signal received`);
        this.isReady = true;
        if (this.readyResolver) {
          this.readyResolver();
          this.readyResolver = null;
        }
        this.send({
          type: "ready_ack",
          jobId: this.jobId,
          timestamp: Date.now(),
          version: "2.0.0"
        });
      } else {
        console.log(`[${this.jobId}] Unknown message type: ${msg.type}`);
      }
    } catch (error3) {
      console.error(`[${this.jobId}] Failed to parse message:`, error3);
    }
  }
  /**
   * RPC Method: Set authentication token for WebSocket connection
   * Called by handlers before starting background processing
   *
   * SECURITY (#212): Tokens are one-time use to prevent session hijacking
   * - Each new token resets the consumed flag
   * - First WebSocket connection consumes the token
   * - Subsequent connections with same token are rejected
   *
   * @param {string} token - Authentication token (UUID)
   * @returns {Promise<{success: boolean}>}
   */
  async setAuthToken(token) {
    await this.storage.put("authToken", token);
    await this.storage.put(
      "authTokenExpiration",
      Date.now() + 2 * 60 * 60 * 1e3
    );
    await this.storage.delete("authTokenConsumed");
    console.log(
      `[${this.jobId || "unknown"}] Auth token set (expires in 2 hours, one-time use)`
    );
    return { success: true };
  }
  /**
   * RPC Method: Wait for client ready signal
   *
   * @param {number} timeoutMs - Timeout in milliseconds
   * @returns {Promise<{timedOut: boolean, disconnected: boolean}>}
   */
  async waitForReady(timeoutMs = 5e3) {
    if (this.isReady) {
      return { timedOut: false, disconnected: false };
    }
    if (!this.webSocket || !this.readyPromise) {
      return { timedOut: false, disconnected: true };
    }
    try {
      await Promise.race([
        this.readyPromise,
        new Promise(
          (_, reject) => setTimeout(() => reject(new Error("Timeout")), timeoutMs)
        )
      ]);
      return { timedOut: false, disconnected: false };
    } catch (error3) {
      if (error3.message === "Timeout") {
        return { timedOut: true, disconnected: false };
      }
      throw error3;
    }
  }
  /**
   * RPC Method: Send message to connected client
   *
   * @param {Object} message - Message to send
   * @returns {Promise<{success: boolean}>}
   */
  async send(message) {
    if (!this.webSocket) {
      console.warn(
        `[${this.jobId}] Cannot send message - no WebSocket connection`
      );
      return { success: false };
    }
    try {
      this.webSocket.send(JSON.stringify(message));
      return { success: true };
    } catch (error3) {
      console.error(`[${this.jobId}] Failed to send message:`, error3);
      return { success: false };
    }
  }
  /**
   * RPC Method: Close WebSocket connection
   *
   * @param {string} reason - Reason for closing
   * @returns {Promise<{success: boolean}>}
   */
  async closeConnection(reason = "Job completed") {
    if (this.webSocket) {
      console.log(`[${this.jobId}] Closing WebSocket: ${reason}`);
      try {
        this.webSocket.close(1e3, reason);
      } catch (error3) {
        console.error(`[${this.jobId}] Error closing WebSocket:`, error3);
      }
    }
    this.cleanup();
    return { success: true };
  }
  /**
   * RPC Method: Clean up stored authentication data
   * Called by JobStateManagerDO during final cleanup to prevent storage leak
   *
   * @returns {Promise<{success: boolean}>}
   */
  async cleanupStorage() {
    await this.storage.delete("authToken");
    await this.storage.delete("authTokenExpiration");
    console.log(`[${this.jobId || "unknown"}] Auth token storage cleaned up`);
    return { success: true };
  }
  /**
   * Internal cleanup
   */
  cleanup() {
    this.webSocket = null;
    this.jobId = null;
    this.isReady = false;
    this.readyPromise = null;
    this.readyResolver = null;
  }
};

// src/durable-objects/job-state-manager.js
import { DurableObject as DurableObject4 } from "cloudflare:workers";

// src/services/csv-processor.js
async function processCSVImport(csvText, progressReporter, env2, jobId) {
  try {
    console.log("[CSV Processor] Waiting for client ready signal");
    const readyResult = await progressReporter.waitForReady(1e4);
    if (readyResult.timedOut || readyResult.disconnected) {
      const reason = readyResult.timedOut ? "timeout" : "not connected";
      console.warn(
        `[CSV Processor] Client ready ${reason}, proceeding anyway (client may miss early updates)`
      );
    } else {
      console.log("[CSV Processor] \u2705 Client ready, starting processing");
    }
    await progressReporter.updateProgress("csv_import", {
      progress: 0.02,
      status: "Validating CSV file...",
      processedCount: 0
    });
    const validation = validateCSV(csvText);
    if (!validation.valid) {
      throw new Error(`Invalid CSV: ${validation.error}`);
    }
    await progressReporter.updateProgress("csv_import", {
      progress: 0.05,
      status: "Uploading CSV to Gemini...",
      processedCount: 0
    });
    const cacheKey = await generateCSVCacheKey(csvText, PROMPT_VERSION);
    let parsedBooks = await env2.KV_CACHE.get(cacheKey, "json");
    if (!parsedBooks) {
      const prompt = buildCSVParserPrompt();
      parsedBooks = await callGemini2(csvText, prompt, env2);
      if (!Array.isArray(parsedBooks) || parsedBooks.length === 0) {
        throw new Error("No valid books found in CSV");
      }
      await env2.KV_CACHE.put(cacheKey, JSON.stringify(parsedBooks), {
        expirationTtl: 604800
      });
    }
    await progressReporter.updateProgress("csv_import", {
      progress: 0.75,
      status: `Gemini parsed ${parsedBooks.length} books with valid title+author`,
      processedCount: parsedBooks.length
    });
    const validatedBooks = parsedBooks.filter((book) => book.title && book.author).map((book) => ({
      title: String(book.title).trim(),
      author: String(book.author).trim(),
      isbn: book.isbn ? String(book.isbn).trim() : void 0
    }));
    const resultsKey = `csv-results:${jobId}`;
    const fullResults = {
      books: validatedBooks,
      errors: [],
      successRate: `${validatedBooks.length}/${parsedBooks.length}`,
      timestamp: Date.now()
    };
    await env2.KV_CACHE.put(resultsKey, JSON.stringify(fullResults), {
      expirationTtl: 86400
      // 24 hours
    });
    console.log(
      `[CSV Processor] \u{1F4BE} Stored full results in KV: ${resultsKey} (${validatedBooks.length} books)`
    );
    await progressReporter.complete("csv_import", {
      booksCount: validatedBooks.length,
      resultsUrl: `/v1/csv/results/${jobId}`,
      // Client fetches full results via HTTP GET
      successRate: `${validatedBooks.length}/${parsedBooks.length}`
    });
    console.log("[CSV Processor] Processing completed successfully");
  } catch (error3) {
    console.error("[CSV Processor] Processing failed:", error3);
    await progressReporter.sendError("csv_import", {
      code: "E_CSV_PROCESSING_FAILED",
      message: error3.message,
      retryable: true,
      details: {
        fallbackAvailable: true,
        suggestion: "Try manual CSV import instead"
      }
    });
  }
}
__name(processCSVImport, "processCSVImport");
async function callGemini2(csvText, prompt, env2) {
  const apiKey = env2.GEMINI_API_KEY?.get ? await env2.GEMINI_API_KEY.get() : env2.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not configured");
  }
  return await parseCSVWithGemini(csvText, prompt, apiKey);
}
__name(callGemini2, "callGemini");

// src/utils/progress-reporter.js
var ProgressReporter = class {
  static {
    __name(this, "ProgressReporter");
  }
  /**
   * Create a new progress reporter
   *
   * @param {string} jobId - Job identifier
   * @param {Object} env - Worker environment bindings
   */
  constructor(jobId, env2) {
    this.jobId = jobId;
    this.env = env2;
    const wsDoId = env2.WEBSOCKET_CONNECTION_DO.idFromName(jobId);
    this.wsStub = env2.WEBSOCKET_CONNECTION_DO.get(wsDoId);
    const stateDoId = env2.JOB_STATE_MANAGER_DO.idFromName(jobId);
    this.stateStub = env2.JOB_STATE_MANAGER_DO.get(stateDoId);
  }
  /**
   * Set authentication token for WebSocket connection
   *
   * @param {string} token - Authentication token
   * @returns {Promise<{success: boolean}>}
   */
  async setAuthToken(token) {
    return await this.wsStub.setAuthToken(token);
  }
  /**
   * Initialize job state
   *
   * @param {string} pipeline - Pipeline type
   * @param {number} totalCount - Total items to process
   * @returns {Promise<{success: boolean}>}
   */
  async initialize(pipeline, totalCount) {
    return await this.stateStub.initializeJobState(
      this.jobId,
      pipeline,
      totalCount
    );
  }
  /**
   * Wait for client ready signal
   *
   * @param {number} timeoutMs - Timeout in milliseconds
   * @returns {Promise<{timedOut: boolean, disconnected: boolean}>}
   */
  async waitForReady(timeoutMs = 5e3) {
    return await this.wsStub.waitForReady(timeoutMs);
  }
  /**
   * Update job progress
   *
   * @param {string} pipeline - Pipeline type
   * @param {Object} payload - Progress payload
   * @returns {Promise<{success: boolean}>}
   */
  async updateProgress(pipeline, payload) {
    return await this.stateStub.updateProgress(pipeline, payload);
  }
  /**
   * Complete job
   *
   * @param {string} pipeline - Pipeline type
   * @param {Object} payload - Completion payload
   * @returns {Promise<{success: boolean}>}
   */
  async complete(pipeline, payload) {
    return await this.stateStub.complete(pipeline, payload);
  }
  /**
   * Send error
   *
   * @param {string} pipeline - Pipeline type
   * @param {Object} payload - Error payload
   * @returns {Promise<{success: boolean}>}
   */
  async sendError(pipeline, payload) {
    return await this.stateStub.sendError(pipeline, payload);
  }
  /**
   * Cancel job
   *
   * @param {string} reason - Cancellation reason
   * @returns {Promise<{success: boolean}>}
   */
  async cancelJob(reason) {
    return await this.stateStub.cancelJob(reason);
  }
  /**
   * Check if job is canceled
   *
   * @returns {Promise<boolean>}
   */
  async isCanceled() {
    return await this.stateStub.isCanceled();
  }
  /**
   * Get job state
   *
   * @returns {Promise<Object|null>}
   */
  async getJobState() {
    return await this.stateStub.getJobState();
  }
  /**
   * Close WebSocket connection
   *
   * @param {string} reason - Reason for closing
   * @returns {Promise<{success: boolean}>}
   */
  async closeConnection(reason) {
    return await this.wsStub.closeConnection(reason);
  }
};

// src/durable-objects/job-state-manager.js
var THROTTLE_CONFIG2 = {
  batch_enrichment: { updateCount: 5, timeSeconds: 10 },
  csv_import: { updateCount: 20, timeSeconds: 30 },
  ai_scan: { updateCount: 1, timeSeconds: 60 }
};
var JobStateManagerDO = class extends DurableObject4 {
  static {
    __name(this, "JobStateManagerDO");
  }
  constructor(state, env2) {
    super(state, env2);
    this.storage = state.storage;
    this.updatesSinceLastPersist = 0;
    this.lastPersistTime = 0;
    this.currentPipeline = null;
  }
  /**
   * RPC Method: Initialize job state with pipeline configuration
   *
   * @param {string} jobId - Job identifier
   * @param {string} pipeline - Pipeline type (batch_enrichment, csv_import, ai_scan)
   * @param {number} totalCount - Total items to process
   * @returns {Promise<{success: boolean}>}
   */
  async initializeJobState(jobId, pipeline, totalCount) {
    console.log(
      `[JobStateManager] Initializing job ${jobId} for pipeline ${pipeline}`
    );
    this.currentPipeline = pipeline;
    const jobState = {
      jobId,
      pipeline,
      totalCount,
      processedCount: 0,
      progress: 0,
      status: "initialized",
      startTime: Date.now(),
      lastUpdateTime: Date.now(),
      canceled: false
    };
    await this.storage.put("jobState", jobState);
    console.log(`[JobStateManager] Job ${jobId} initialized`);
    return { success: true };
  }
  /**
   * RPC Method: Update job progress
   *
   * @param {string} pipeline - Pipeline type
   * @param {Object} payload - Progress update payload
   * @returns {Promise<{success: boolean}>}
   */
  async updateProgress(pipeline, payload) {
    const jobState = await this.storage.get("jobState");
    if (!jobState) {
      console.warn("[JobStateManager] No job state found for progress update");
      return { success: false };
    }
    const updatedState = {
      ...jobState,
      progress: payload.progress ?? jobState.progress,
      status: payload.status ?? jobState.status,
      processedCount: payload.processedCount ?? jobState.processedCount,
      lastUpdateTime: Date.now()
    };
    const throttleConfig = THROTTLE_CONFIG2[pipeline] || {
      updateCount: 10,
      timeSeconds: 20
    };
    this.updatesSinceLastPersist++;
    const timeSinceLastPersist = (Date.now() - this.lastPersistTime) / 1e3;
    const shouldPersist = this.updatesSinceLastPersist >= throttleConfig.updateCount || timeSinceLastPersist >= throttleConfig.timeSeconds;
    if (shouldPersist) {
      await this.storage.put("jobState", updatedState);
      this.updatesSinceLastPersist = 0;
      this.lastPersistTime = Date.now();
      console.log(
        `[JobStateManager] State persisted for job ${jobState.jobId}`
      );
    }
    const wsDoId = this.env.WEBSOCKET_CONNECTION_DO.idFromName(jobState.jobId);
    const wsDoStub = this.env.WEBSOCKET_CONNECTION_DO.get(wsDoId);
    await wsDoStub.send({
      type: "progress",
      jobId: jobState.jobId,
      pipeline,
      timestamp: Date.now(),
      version: "2.0.0",
      payload
    });
    return { success: true };
  }
  /**
   * RPC Method: Complete job
   *
   * @param {string} pipeline - Pipeline type
   * @param {Object} payload - Completion payload
   * @returns {Promise<{success: boolean}>}
   */
  async complete(pipeline, payload) {
    const jobState = await this.storage.get("jobState");
    if (!jobState) {
      console.warn("[JobStateManager] No job state found for completion");
      return { success: false };
    }
    const completedState = {
      ...jobState,
      status: "completed",
      progress: 1,
      completedTime: Date.now(),
      result: payload
    };
    await this.storage.put("jobState", completedState);
    console.log(`[JobStateManager] Job ${jobState.jobId} completed`);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1e3).toISOString();
    const wsDoId = this.env.WEBSOCKET_CONNECTION_DO.idFromName(jobState.jobId);
    const wsDoStub = this.env.WEBSOCKET_CONNECTION_DO.get(wsDoId);
    await wsDoStub.send({
      type: "complete",
      jobId: jobState.jobId,
      pipeline,
      timestamp: Date.now(),
      version: "2.0.0",
      payload: {
        ...payload,
        expiresAt
        // Add expiry timestamp to payload
      }
    });
    await this.storage.setAlarm(Date.now() + 24 * 60 * 60 * 1e3);
    void new Promise((resolve) => {
      setTimeout(async () => {
        try {
          await wsDoStub.closeConnection("Job completed");
          resolve();
        } catch (err) {
          console.error(
            `[JobStateManager] Failed to close connection for job ${jobState.jobId}:`,
            err
          );
          resolve();
        }
      }, 1e3);
    });
    return { success: true };
  }
  /**
   * RPC Method: Fail job with error
   *
   * @param {string} pipeline - Pipeline type
   * @param {Object} payload - Error payload
   * @returns {Promise<{success: boolean}>}
   */
  async sendError(pipeline, payload) {
    const jobState = await this.storage.get("jobState");
    if (!jobState) {
      console.warn("[JobStateManager] No job state found for error");
      return { success: false };
    }
    const failedState = {
      ...jobState,
      status: "failed",
      failedTime: Date.now(),
      error: payload
    };
    await this.storage.put("jobState", failedState);
    console.log(`[JobStateManager] Job ${jobState.jobId} failed`);
    const wsDoId = this.env.WEBSOCKET_CONNECTION_DO.idFromName(jobState.jobId);
    const wsDoStub = this.env.WEBSOCKET_CONNECTION_DO.get(wsDoId);
    await wsDoStub.send({
      type: "error",
      jobId: jobState.jobId,
      pipeline,
      timestamp: Date.now(),
      version: "2.0.0",
      payload: {
        type: "error",
        data: null,
        // Always null for errors (matches HTTP ResponseEnvelope)
        metadata: {
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        },
        error: {
          message: payload.message,
          code: payload.code,
          details: payload.details
        },
        retryable: payload.retryable
      }
    });
    await this.storage.setAlarm(Date.now() + 24 * 60 * 60 * 1e3);
    void new Promise((resolve) => {
      setTimeout(async () => {
        try {
          await wsDoStub.closeConnection("Job failed");
          resolve();
        } catch (err) {
          console.error(
            `[JobStateManager] Failed to close connection for job ${jobState.jobId}:`,
            err
          );
          resolve();
        }
      }, 1e3);
    });
    return { success: true };
  }
  /**
   * RPC Method: Get current job state
   *
   * @returns {Promise<Object|null>} Current job state or null
   */
  async getJobState() {
    return await this.storage.get("jobState");
  }
  /**
   * RPC Method: Cancel job
   *
   * @param {string} reason - Cancellation reason
   * @returns {Promise<{success: boolean}>}
   */
  async cancelJob(reason = "Job canceled by user") {
    const jobState = await this.storage.get("jobState");
    if (!jobState) {
      console.warn("[JobStateManager] No job state found for cancellation");
      return { success: false };
    }
    const canceledState = {
      ...jobState,
      canceled: true,
      cancelReason: reason,
      canceledTime: Date.now()
    };
    await this.storage.put("jobState", canceledState);
    console.log(`[JobStateManager] Job ${jobState.jobId} canceled: ${reason}`);
    return { success: true };
  }
  /**
   * RPC Method: Check if job is canceled
   *
   * @returns {Promise<boolean>}
   */
  async isCanceled() {
    const jobState = await this.storage.get("jobState");
    return jobState?.canceled || false;
  }
  /**
   * RPC Method: Schedule CSV processing via alarm
   *
   * @param {string} csvText - Raw CSV content
   * @param {string} jobId - Job identifier
   * @returns {Promise<{success: boolean}>}
   */
  async scheduleCSVProcessing(csvText, jobId) {
    await this.storage.put("csvText", csvText);
    await this.storage.put("processingType", "csv_import");
    await this.storage.setAlarm(Date.now());
    console.log(`[JobStateManager] Scheduled CSV processing for job ${jobId}`);
    return { success: true };
  }
  /**
   * RPC Method: Schedule bookshelf scan processing via alarm
   *
   * Avoids Worker CPU time limits for long-running Gemini AI calls (20-60s)
   * Similar to CSV import, this delegates work to Durable Object alarm context
   *
   * @param {ArrayBuffer} imageData - Raw image data
   * @param {string} jobId - Job identifier
   * @param {Object} requestHeaders - Headers from original request (X-AI-Provider, etc.)
   * @returns {Promise<{success: boolean}>}
   */
  async scheduleBookshelfScan(imageData, jobId, requestHeaders) {
    await this.storage.put("imageData", imageData);
    await this.storage.put("requestHeaders", requestHeaders || {});
    await this.storage.put("processingType", "bookshelf_scan");
    await this.storage.setAlarm(Date.now());
    console.log(`[JobStateManager] Scheduled bookshelf scan for job ${jobId}`);
    return { success: true };
  }
  /**
   * Alarm handler: Process CSV, bookshelf scan, or cleanup old job state
   *
   * Handles three scenarios:
   * 1. CSV processing (triggered immediately after scheduling)
   * 2. Bookshelf scan processing (triggered immediately after scheduling)
   * 3. Cleanup after 24 hours (triggered after job completion/failure)
   */
  async alarm() {
    const processingType = await this.storage.get("processingType");
    if (processingType === "csv_import") {
      console.log("[JobStateManager] Alarm triggered for CSV processing");
      const csvText = await this.storage.get("csvText");
      const jobState = await this.storage.get("jobState");
      if (!csvText || !jobState) {
        console.error(
          "[JobStateManager] Missing CSV text or job state in alarm handler"
        );
        return;
      }
      const reporter = new ProgressReporter(jobState.jobId, this.env);
      try {
        await processCSVImport(csvText, reporter, this.env, jobState.jobId);
      } catch (error3) {
        console.error(
          "[JobStateManager] CSV processing failed in alarm:",
          error3
        );
        await reporter.sendError("csv_import", {
          code: "E_ALARM_PROCESSING_FAILED",
          message: error3.message || "CSV processing failed",
          retryable: true,
          details: {
            fallbackAvailable: true,
            suggestion: "Try manual CSV import or contact support if issue persists"
          }
        });
      }
      await this.storage.delete("csvText");
      await this.storage.delete("processingType");
    } else if (processingType === "bookshelf_scan") {
      console.log(
        "[JobStateManager] Alarm triggered for bookshelf scan processing"
      );
      const imageData = await this.storage.get("imageData");
      const requestHeaders = await this.storage.get("requestHeaders");
      const jobState = await this.storage.get("jobState");
      if (!imageData || !jobState) {
        console.error(
          "[JobStateManager] Missing image data or job state in alarm handler"
        );
        return;
      }
      const reporter = new ProgressReporter(jobState.jobId, this.env);
      try {
        const mockRequest = {
          headers: {
            get: /* @__PURE__ */ __name((key) => requestHeaders[key] || null, "get")
          }
        };
        await processBookshelfScan(
          jobState.jobId,
          imageData,
          mockRequest,
          this.env,
          reporter,
          // Use reporter instead of doStub
          null
          // No execution context in alarm
        );
      } catch (error3) {
        console.error(
          "[JobStateManager] Bookshelf scan processing failed in alarm:",
          error3
        );
        await reporter.sendError("ai_scan", {
          code: "E_ALARM_PROCESSING_FAILED",
          message: error3.message || "Bookshelf scan processing failed",
          retryable: true,
          details: {
            fallbackAvailable: false,
            suggestion: "Try uploading a clearer photo or contact support if issue persists"
          }
        });
      }
      await this.storage.delete("imageData");
      await this.storage.delete("requestHeaders");
      await this.storage.delete("processingType");
    } else {
      console.log(
        "[JobStateManager] Cleanup alarm triggered - removing old state"
      );
      const jobState = await this.storage.get("jobState");
      if (jobState?.jobId) {
        try {
          const wsDoId = this.env.WEBSOCKET_CONNECTION_DO.idFromName(
            jobState.jobId
          );
          const wsDoStub = this.env.WEBSOCKET_CONNECTION_DO.get(wsDoId);
          await wsDoStub.cleanupStorage();
        } catch (error3) {
          console.warn(
            "[JobStateManager] Failed to cleanup WebSocket DO storage:",
            error3
          );
        }
      }
      await this.storage.delete("jobState");
    }
  }
};

// src/durable-objects/cache-metrics.js
var CHURN_WINDOW_MS = 5 * 60 * 1e3;
var ALARM_INTERVAL_MS = 60 * 1e3;
var STATE_PERSIST_INTERVAL_MS = 5 * 60 * 1e3;
var CacheMetricsDO = class {
  static {
    __name(this, "CacheMetricsDO");
  }
  constructor(state, env2) {
    this.state = state;
    this.env = env2;
    this.stats = this.initializeStats();
    this.lastPersisted = Date.now();
    this.state.blockConcurrencyWhile(async () => {
      await this.loadStats();
      await this.setupAlarm();
    });
  }
  /**
   * Initialize empty stats structure
   */
  initializeStats() {
    const emptyStats = /* @__PURE__ */ __name(() => ({
      hits: 0,
      misses: 0,
      reads: 0,
      writes: 0,
      churns: 0,
      ttl_effective_hits: 0
    }), "emptyStats");
    const emptyTimeWindow = /* @__PURE__ */ __name(() => ({
      prefixes: {},
      total: emptyStats()
    }), "emptyTimeWindow");
    return {
      lastUpdated: Date.now(),
      currentMinute: emptyTimeWindow(),
      currentHour: emptyTimeWindow(),
      currentDay: emptyTimeWindow(),
      total: emptyTimeWindow(),
      lastPutTimestamps: {}
      // Plain object for storage compatibility
    };
  }
  /**
   * Load stats from durable storage
   */
  async loadStats() {
    const storedStats = await this.state.storage.get("cacheStats");
    if (storedStats) {
      this.stats = storedStats;
      if (!this.stats.currentMinute)
        this.stats.currentMinute = this.initializeStats().currentMinute;
      if (!this.stats.currentHour)
        this.stats.currentHour = this.initializeStats().currentHour;
      if (!this.stats.currentDay)
        this.stats.currentDay = this.initializeStats().currentDay;
      if (!this.stats.total) this.stats.total = this.initializeStats().total;
      if (!this.stats.lastPutTimestamps) this.stats.lastPutTimestamps = {};
    }
  }
  /**
   * Persist stats to durable storage
   */
  async persistStats() {
    await this.state.storage.put("cacheStats", this.stats);
    this.lastPersisted = Date.now();
  }
  /**
   * Setup periodic alarm
   */
  async setupAlarm() {
    const currentAlarm = await this.state.storage.getAlarm();
    if (currentAlarm === null || currentAlarm < Date.now()) {
      await this.state.storage.setAlarm(Date.now() + ALARM_INTERVAL_MS);
    }
  }
  /**
   * Alarm handler - runs every minute for rollovers
   */
  async alarm() {
    const now = Date.now();
    const lastUpdated = this.stats.lastUpdated;
    const lastUpdatedDate = new Date(lastUpdated);
    const nowMinute = new Date(now).getMinutes();
    const lastMinute = lastUpdatedDate.getMinutes();
    const nowHour = new Date(now).getHours();
    const lastHour = lastUpdatedDate.getHours();
    const nowDay = new Date(now).getDate();
    const lastDay = lastUpdatedDate.getDate();
    if (nowMinute !== lastMinute) {
      this.aggregateWindow(this.stats.currentMinute, this.stats.currentHour);
      this.stats.currentMinute = this.initializeStats().currentMinute;
    }
    if (nowHour !== lastHour) {
      this.aggregateWindow(this.stats.currentHour, this.stats.currentDay);
      this.stats.currentHour = this.initializeStats().currentHour;
    }
    if (nowDay !== lastDay) {
      this.stats.currentDay = this.initializeStats().currentDay;
    }
    const churnKeys = Object.keys(this.stats.lastPutTimestamps);
    for (const key of churnKeys) {
      const timestamp = this.stats.lastPutTimestamps[key];
      if (now - timestamp > CHURN_WINDOW_MS) {
        delete this.stats.lastPutTimestamps[key];
      }
    }
    this.stats.lastUpdated = now;
    if (now - this.lastPersisted > STATE_PERSIST_INTERVAL_MS) {
      await this.persistStats();
    }
    await this.state.storage.setAlarm(now + ALARM_INTERVAL_MS);
  }
  /**
   * Aggregate source window into destination window
   */
  aggregateWindow(source, destination) {
    this.addStats(destination.total, source.total);
    for (const prefix in source.prefixes) {
      if (!destination.prefixes[prefix]) {
        destination.prefixes[prefix] = {
          hits: 0,
          misses: 0,
          reads: 0,
          writes: 0,
          churns: 0,
          ttl_effective_hits: 0
        };
      }
      this.addStats(destination.prefixes[prefix], source.prefixes[prefix]);
    }
  }
  /**
   * Add source stats to target stats
   */
  addStats(target, source) {
    target.hits += source.hits;
    target.misses += source.misses;
    target.reads += source.reads;
    target.writes += source.writes;
    target.churns += source.churns;
    target.ttl_effective_hits += source.ttl_effective_hits;
  }
  /**
   * Update stats for a cache event
   */
  updateStats(event, windowStats) {
    if (!windowStats.prefixes[event.prefix]) {
      windowStats.prefixes[event.prefix] = {
        hits: 0,
        misses: 0,
        reads: 0,
        writes: 0,
        churns: 0,
        ttl_effective_hits: 0
      };
    }
    const prefixStats = windowStats.prefixes[event.prefix];
    const update = /* @__PURE__ */ __name((stats) => {
      if (event.type === "hit") {
        stats.hits++;
        stats.reads++;
        if (event.hotTtlExpiry && event.timestamp > event.hotTtlExpiry) {
          stats.ttl_effective_hits++;
        }
      } else if (event.type === "miss") {
        stats.misses++;
        stats.reads++;
      } else if (event.type === "write") {
        stats.writes++;
        const lastPut = this.stats.lastPutTimestamps[event.key];
        if (lastPut && event.timestamp - lastPut < CHURN_WINDOW_MS) {
          stats.churns++;
        }
        this.stats.lastPutTimestamps[event.key] = event.timestamp;
      }
    }, "update");
    update(prefixStats);
    update(windowStats.total);
  }
  /**
   * Handle incoming requests
   */
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/event" && request.method === "POST") {
      try {
        const event = await request.json();
        this.updateStats(event, this.stats.currentMinute);
        this.updateStats(event, this.stats.currentHour);
        this.updateStats(event, this.stats.currentDay);
        this.updateStats(event, this.stats.total);
        this.stats.lastUpdated = event.timestamp;
        if (Date.now() - this.lastPersisted > STATE_PERSIST_INTERVAL_MS / 2) {
          await this.persistStats();
        }
        return new Response("Event received", { status: 200 });
      } catch (error3) {
        console.error("Failed to process cache event:", error3);
        return new Response("Bad Request", { status: 400 });
      }
    } else if (url.pathname === "/stats" && request.method === "GET") {
      return new Response(JSON.stringify(this.stats), {
        headers: { "Content-Type": "application/json" }
      });
    }
    return new Response("Not Found", { status: 404 });
  }
};

// node_modules/hono/dist/compose.js
var compose = /* @__PURE__ */ __name((middleware, onError, onNotFound) => {
  return (context2, next) => {
    let index = -1;
    return dispatch(0);
    async function dispatch(i) {
      if (i <= index) {
        throw new Error("next() called multiple times");
      }
      index = i;
      let res;
      let isError = false;
      let handler;
      if (middleware[i]) {
        handler = middleware[i][0][0];
        context2.req.routeIndex = i;
      } else {
        handler = i === middleware.length && next || void 0;
      }
      if (handler) {
        try {
          res = await handler(context2, () => dispatch(i + 1));
        } catch (err) {
          if (err instanceof Error && onError) {
            context2.error = err;
            res = await onError(err, context2);
            isError = true;
          } else {
            throw err;
          }
        }
      } else {
        if (context2.finalized === false && onNotFound) {
          res = await onNotFound(context2);
        }
      }
      if (res && (context2.finalized === false || isError)) {
        context2.res = res;
      }
      return context2;
    }
    __name(dispatch, "dispatch");
  };
}, "compose");

// node_modules/hono/dist/request/constants.js
var GET_MATCH_RESULT = Symbol();

// node_modules/hono/dist/utils/body.js
var parseBody = /* @__PURE__ */ __name(async (request, options = /* @__PURE__ */ Object.create(null)) => {
  const { all = false, dot = false } = options;
  const headers = request instanceof HonoRequest ? request.raw.headers : request.headers;
  const contentType = headers.get("Content-Type");
  if (contentType?.startsWith("multipart/form-data") || contentType?.startsWith("application/x-www-form-urlencoded")) {
    return parseFormData(request, { all, dot });
  }
  return {};
}, "parseBody");
async function parseFormData(request, options) {
  const formData = await request.formData();
  if (formData) {
    return convertFormDataToBodyData(formData, options);
  }
  return {};
}
__name(parseFormData, "parseFormData");
function convertFormDataToBodyData(formData, options) {
  const form = /* @__PURE__ */ Object.create(null);
  formData.forEach((value, key) => {
    const shouldParseAllValues = options.all || key.endsWith("[]");
    if (!shouldParseAllValues) {
      form[key] = value;
    } else {
      handleParsingAllValues(form, key, value);
    }
  });
  if (options.dot) {
    Object.entries(form).forEach(([key, value]) => {
      const shouldParseDotValues = key.includes(".");
      if (shouldParseDotValues) {
        handleParsingNestedValues(form, key, value);
        delete form[key];
      }
    });
  }
  return form;
}
__name(convertFormDataToBodyData, "convertFormDataToBodyData");
var handleParsingAllValues = /* @__PURE__ */ __name((form, key, value) => {
  if (form[key] !== void 0) {
    if (Array.isArray(form[key])) {
      ;
      form[key].push(value);
    } else {
      form[key] = [form[key], value];
    }
  } else {
    if (!key.endsWith("[]")) {
      form[key] = value;
    } else {
      form[key] = [value];
    }
  }
}, "handleParsingAllValues");
var handleParsingNestedValues = /* @__PURE__ */ __name((form, key, value) => {
  let nestedForm = form;
  const keys = key.split(".");
  keys.forEach((key2, index) => {
    if (index === keys.length - 1) {
      nestedForm[key2] = value;
    } else {
      if (!nestedForm[key2] || typeof nestedForm[key2] !== "object" || Array.isArray(nestedForm[key2]) || nestedForm[key2] instanceof File) {
        nestedForm[key2] = /* @__PURE__ */ Object.create(null);
      }
      nestedForm = nestedForm[key2];
    }
  });
}, "handleParsingNestedValues");

// node_modules/hono/dist/utils/url.js
var splitPath = /* @__PURE__ */ __name((path) => {
  const paths = path.split("/");
  if (paths[0] === "") {
    paths.shift();
  }
  return paths;
}, "splitPath");
var splitRoutingPath = /* @__PURE__ */ __name((routePath) => {
  const { groups, path } = extractGroupsFromPath(routePath);
  const paths = splitPath(path);
  return replaceGroupMarks(paths, groups);
}, "splitRoutingPath");
var extractGroupsFromPath = /* @__PURE__ */ __name((path) => {
  const groups = [];
  path = path.replace(/\{[^}]+\}/g, (match2, index) => {
    const mark = `@${index}`;
    groups.push([mark, match2]);
    return mark;
  });
  return { groups, path };
}, "extractGroupsFromPath");
var replaceGroupMarks = /* @__PURE__ */ __name((paths, groups) => {
  for (let i = groups.length - 1; i >= 0; i--) {
    const [mark] = groups[i];
    for (let j = paths.length - 1; j >= 0; j--) {
      if (paths[j].includes(mark)) {
        paths[j] = paths[j].replace(mark, groups[i][1]);
        break;
      }
    }
  }
  return paths;
}, "replaceGroupMarks");
var patternCache = {};
var getPattern = /* @__PURE__ */ __name((label, next) => {
  if (label === "*") {
    return "*";
  }
  const match2 = label.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
  if (match2) {
    const cacheKey = `${label}#${next}`;
    if (!patternCache[cacheKey]) {
      if (match2[2]) {
        patternCache[cacheKey] = next && next[0] !== ":" && next[0] !== "*" ? [cacheKey, match2[1], new RegExp(`^${match2[2]}(?=/${next})`)] : [label, match2[1], new RegExp(`^${match2[2]}$`)];
      } else {
        patternCache[cacheKey] = [label, match2[1], true];
      }
    }
    return patternCache[cacheKey];
  }
  return null;
}, "getPattern");
var tryDecode = /* @__PURE__ */ __name((str, decoder) => {
  try {
    return decoder(str);
  } catch {
    return str.replace(/(?:%[0-9A-Fa-f]{2})+/g, (match2) => {
      try {
        return decoder(match2);
      } catch {
        return match2;
      }
    });
  }
}, "tryDecode");
var tryDecodeURI = /* @__PURE__ */ __name((str) => tryDecode(str, decodeURI), "tryDecodeURI");
var getPath = /* @__PURE__ */ __name((request) => {
  const url = request.url;
  const start = url.indexOf("/", url.indexOf(":") + 4);
  let i = start;
  for (; i < url.length; i++) {
    const charCode = url.charCodeAt(i);
    if (charCode === 37) {
      const queryIndex = url.indexOf("?", i);
      const path = url.slice(start, queryIndex === -1 ? void 0 : queryIndex);
      return tryDecodeURI(path.includes("%25") ? path.replace(/%25/g, "%2525") : path);
    } else if (charCode === 63) {
      break;
    }
  }
  return url.slice(start, i);
}, "getPath");
var getPathNoStrict = /* @__PURE__ */ __name((request) => {
  const result = getPath(request);
  return result.length > 1 && result.at(-1) === "/" ? result.slice(0, -1) : result;
}, "getPathNoStrict");
var mergePath = /* @__PURE__ */ __name((base, sub, ...rest) => {
  if (rest.length) {
    sub = mergePath(sub, ...rest);
  }
  return `${base?.[0] === "/" ? "" : "/"}${base}${sub === "/" ? "" : `${base?.at(-1) === "/" ? "" : "/"}${sub?.[0] === "/" ? sub.slice(1) : sub}`}`;
}, "mergePath");
var checkOptionalParameter = /* @__PURE__ */ __name((path) => {
  if (path.charCodeAt(path.length - 1) !== 63 || !path.includes(":")) {
    return null;
  }
  const segments = path.split("/");
  const results = [];
  let basePath = "";
  segments.forEach((segment) => {
    if (segment !== "" && !/\:/.test(segment)) {
      basePath += "/" + segment;
    } else if (/\:/.test(segment)) {
      if (/\?/.test(segment)) {
        if (results.length === 0 && basePath === "") {
          results.push("/");
        } else {
          results.push(basePath);
        }
        const optionalSegment = segment.replace("?", "");
        basePath += "/" + optionalSegment;
        results.push(basePath);
      } else {
        basePath += "/" + segment;
      }
    }
  });
  return results.filter((v, i, a) => a.indexOf(v) === i);
}, "checkOptionalParameter");
var _decodeURI = /* @__PURE__ */ __name((value) => {
  if (!/[%+]/.test(value)) {
    return value;
  }
  if (value.indexOf("+") !== -1) {
    value = value.replace(/\+/g, " ");
  }
  return value.indexOf("%") !== -1 ? tryDecode(value, decodeURIComponent_) : value;
}, "_decodeURI");
var _getQueryParam = /* @__PURE__ */ __name((url, key, multiple) => {
  let encoded;
  if (!multiple && key && !/[%+]/.test(key)) {
    let keyIndex2 = url.indexOf("?", 8);
    if (keyIndex2 === -1) {
      return void 0;
    }
    if (!url.startsWith(key, keyIndex2 + 1)) {
      keyIndex2 = url.indexOf(`&${key}`, keyIndex2 + 1);
    }
    while (keyIndex2 !== -1) {
      const trailingKeyCode = url.charCodeAt(keyIndex2 + key.length + 1);
      if (trailingKeyCode === 61) {
        const valueIndex = keyIndex2 + key.length + 2;
        const endIndex = url.indexOf("&", valueIndex);
        return _decodeURI(url.slice(valueIndex, endIndex === -1 ? void 0 : endIndex));
      } else if (trailingKeyCode == 38 || isNaN(trailingKeyCode)) {
        return "";
      }
      keyIndex2 = url.indexOf(`&${key}`, keyIndex2 + 1);
    }
    encoded = /[%+]/.test(url);
    if (!encoded) {
      return void 0;
    }
  }
  const results = {};
  encoded ??= /[%+]/.test(url);
  let keyIndex = url.indexOf("?", 8);
  while (keyIndex !== -1) {
    const nextKeyIndex = url.indexOf("&", keyIndex + 1);
    let valueIndex = url.indexOf("=", keyIndex);
    if (valueIndex > nextKeyIndex && nextKeyIndex !== -1) {
      valueIndex = -1;
    }
    let name = url.slice(
      keyIndex + 1,
      valueIndex === -1 ? nextKeyIndex === -1 ? void 0 : nextKeyIndex : valueIndex
    );
    if (encoded) {
      name = _decodeURI(name);
    }
    keyIndex = nextKeyIndex;
    if (name === "") {
      continue;
    }
    let value;
    if (valueIndex === -1) {
      value = "";
    } else {
      value = url.slice(valueIndex + 1, nextKeyIndex === -1 ? void 0 : nextKeyIndex);
      if (encoded) {
        value = _decodeURI(value);
      }
    }
    if (multiple) {
      if (!(results[name] && Array.isArray(results[name]))) {
        results[name] = [];
      }
      ;
      results[name].push(value);
    } else {
      results[name] ??= value;
    }
  }
  return key ? results[key] : results;
}, "_getQueryParam");
var getQueryParam = _getQueryParam;
var getQueryParams = /* @__PURE__ */ __name((url, key) => {
  return _getQueryParam(url, key, true);
}, "getQueryParams");
var decodeURIComponent_ = decodeURIComponent;

// node_modules/hono/dist/request.js
var tryDecodeURIComponent = /* @__PURE__ */ __name((str) => tryDecode(str, decodeURIComponent_), "tryDecodeURIComponent");
var HonoRequest = class {
  static {
    __name(this, "HonoRequest");
  }
  raw;
  #validatedData;
  #matchResult;
  routeIndex = 0;
  path;
  bodyCache = {};
  constructor(request, path = "/", matchResult = [[]]) {
    this.raw = request;
    this.path = path;
    this.#matchResult = matchResult;
    this.#validatedData = {};
  }
  param(key) {
    return key ? this.#getDecodedParam(key) : this.#getAllDecodedParams();
  }
  #getDecodedParam(key) {
    const paramKey = this.#matchResult[0][this.routeIndex][1][key];
    const param = this.#getParamValue(paramKey);
    return param && /\%/.test(param) ? tryDecodeURIComponent(param) : param;
  }
  #getAllDecodedParams() {
    const decoded = {};
    const keys = Object.keys(this.#matchResult[0][this.routeIndex][1]);
    for (const key of keys) {
      const value = this.#getParamValue(this.#matchResult[0][this.routeIndex][1][key]);
      if (value !== void 0) {
        decoded[key] = /\%/.test(value) ? tryDecodeURIComponent(value) : value;
      }
    }
    return decoded;
  }
  #getParamValue(paramKey) {
    return this.#matchResult[1] ? this.#matchResult[1][paramKey] : paramKey;
  }
  query(key) {
    return getQueryParam(this.url, key);
  }
  queries(key) {
    return getQueryParams(this.url, key);
  }
  header(name) {
    if (name) {
      return this.raw.headers.get(name) ?? void 0;
    }
    const headerData = {};
    this.raw.headers.forEach((value, key) => {
      headerData[key] = value;
    });
    return headerData;
  }
  async parseBody(options) {
    return this.bodyCache.parsedBody ??= await parseBody(this, options);
  }
  #cachedBody = /* @__PURE__ */ __name((key) => {
    const { bodyCache, raw: raw2 } = this;
    const cachedBody = bodyCache[key];
    if (cachedBody) {
      return cachedBody;
    }
    const anyCachedKey = Object.keys(bodyCache)[0];
    if (anyCachedKey) {
      return bodyCache[anyCachedKey].then((body) => {
        if (anyCachedKey === "json") {
          body = JSON.stringify(body);
        }
        return new Response(body)[key]();
      });
    }
    return bodyCache[key] = raw2[key]();
  }, "#cachedBody");
  json() {
    return this.#cachedBody("text").then((text) => JSON.parse(text));
  }
  text() {
    return this.#cachedBody("text");
  }
  arrayBuffer() {
    return this.#cachedBody("arrayBuffer");
  }
  blob() {
    return this.#cachedBody("blob");
  }
  formData() {
    return this.#cachedBody("formData");
  }
  addValidatedData(target, data) {
    this.#validatedData[target] = data;
  }
  valid(target) {
    return this.#validatedData[target];
  }
  get url() {
    return this.raw.url;
  }
  get method() {
    return this.raw.method;
  }
  get [GET_MATCH_RESULT]() {
    return this.#matchResult;
  }
  get matchedRoutes() {
    return this.#matchResult[0].map(([[, route]]) => route);
  }
  get routePath() {
    return this.#matchResult[0].map(([[, route]]) => route)[this.routeIndex].path;
  }
};

// node_modules/hono/dist/utils/html.js
var HtmlEscapedCallbackPhase = {
  Stringify: 1,
  BeforeStream: 2,
  Stream: 3
};
var raw = /* @__PURE__ */ __name((value, callbacks) => {
  const escapedString = new String(value);
  escapedString.isEscaped = true;
  escapedString.callbacks = callbacks;
  return escapedString;
}, "raw");
var resolveCallback = /* @__PURE__ */ __name(async (str, phase, preserveCallbacks, context2, buffer) => {
  if (typeof str === "object" && !(str instanceof String)) {
    if (!(str instanceof Promise)) {
      str = str.toString();
    }
    if (str instanceof Promise) {
      str = await str;
    }
  }
  const callbacks = str.callbacks;
  if (!callbacks?.length) {
    return Promise.resolve(str);
  }
  if (buffer) {
    buffer[0] += str;
  } else {
    buffer = [str];
  }
  const resStr = Promise.all(callbacks.map((c) => c({ phase, buffer, context: context2 }))).then(
    (res) => Promise.all(
      res.filter(Boolean).map((str2) => resolveCallback(str2, phase, false, context2, buffer))
    ).then(() => buffer[0])
  );
  if (preserveCallbacks) {
    return raw(await resStr, callbacks);
  } else {
    return resStr;
  }
}, "resolveCallback");

// node_modules/hono/dist/context.js
var TEXT_PLAIN = "text/plain; charset=UTF-8";
var setDefaultContentType = /* @__PURE__ */ __name((contentType, headers) => {
  return {
    "Content-Type": contentType,
    ...headers
  };
}, "setDefaultContentType");
var Context = class {
  static {
    __name(this, "Context");
  }
  #rawRequest;
  #req;
  env = {};
  #var;
  finalized = false;
  error;
  #status;
  #executionCtx;
  #res;
  #layout;
  #renderer;
  #notFoundHandler;
  #preparedHeaders;
  #matchResult;
  #path;
  constructor(req, options) {
    this.#rawRequest = req;
    if (options) {
      this.#executionCtx = options.executionCtx;
      this.env = options.env;
      this.#notFoundHandler = options.notFoundHandler;
      this.#path = options.path;
      this.#matchResult = options.matchResult;
    }
  }
  get req() {
    this.#req ??= new HonoRequest(this.#rawRequest, this.#path, this.#matchResult);
    return this.#req;
  }
  get event() {
    if (this.#executionCtx && "respondWith" in this.#executionCtx) {
      return this.#executionCtx;
    } else {
      throw Error("This context has no FetchEvent");
    }
  }
  get executionCtx() {
    if (this.#executionCtx) {
      return this.#executionCtx;
    } else {
      throw Error("This context has no ExecutionContext");
    }
  }
  get res() {
    return this.#res ||= new Response(null, {
      headers: this.#preparedHeaders ??= new Headers()
    });
  }
  set res(_res) {
    if (this.#res && _res) {
      _res = new Response(_res.body, _res);
      for (const [k, v] of this.#res.headers.entries()) {
        if (k === "content-type") {
          continue;
        }
        if (k === "set-cookie") {
          const cookies = this.#res.headers.getSetCookie();
          _res.headers.delete("set-cookie");
          for (const cookie of cookies) {
            _res.headers.append("set-cookie", cookie);
          }
        } else {
          _res.headers.set(k, v);
        }
      }
    }
    this.#res = _res;
    this.finalized = true;
  }
  render = /* @__PURE__ */ __name((...args) => {
    this.#renderer ??= (content) => this.html(content);
    return this.#renderer(...args);
  }, "render");
  setLayout = /* @__PURE__ */ __name((layout) => this.#layout = layout, "setLayout");
  getLayout = /* @__PURE__ */ __name(() => this.#layout, "getLayout");
  setRenderer = /* @__PURE__ */ __name((renderer) => {
    this.#renderer = renderer;
  }, "setRenderer");
  header = /* @__PURE__ */ __name((name, value, options) => {
    if (this.finalized) {
      this.#res = new Response(this.#res.body, this.#res);
    }
    const headers = this.#res ? this.#res.headers : this.#preparedHeaders ??= new Headers();
    if (value === void 0) {
      headers.delete(name);
    } else if (options?.append) {
      headers.append(name, value);
    } else {
      headers.set(name, value);
    }
  }, "header");
  status = /* @__PURE__ */ __name((status) => {
    this.#status = status;
  }, "status");
  set = /* @__PURE__ */ __name((key, value) => {
    this.#var ??= /* @__PURE__ */ new Map();
    this.#var.set(key, value);
  }, "set");
  get = /* @__PURE__ */ __name((key) => {
    return this.#var ? this.#var.get(key) : void 0;
  }, "get");
  get var() {
    if (!this.#var) {
      return {};
    }
    return Object.fromEntries(this.#var);
  }
  #newResponse(data, arg, headers) {
    const responseHeaders = this.#res ? new Headers(this.#res.headers) : this.#preparedHeaders ?? new Headers();
    if (typeof arg === "object" && "headers" in arg) {
      const argHeaders = arg.headers instanceof Headers ? arg.headers : new Headers(arg.headers);
      for (const [key, value] of argHeaders) {
        if (key.toLowerCase() === "set-cookie") {
          responseHeaders.append(key, value);
        } else {
          responseHeaders.set(key, value);
        }
      }
    }
    if (headers) {
      for (const [k, v] of Object.entries(headers)) {
        if (typeof v === "string") {
          responseHeaders.set(k, v);
        } else {
          responseHeaders.delete(k);
          for (const v2 of v) {
            responseHeaders.append(k, v2);
          }
        }
      }
    }
    const status = typeof arg === "number" ? arg : arg?.status ?? this.#status;
    return new Response(data, { status, headers: responseHeaders });
  }
  newResponse = /* @__PURE__ */ __name((...args) => this.#newResponse(...args), "newResponse");
  body = /* @__PURE__ */ __name((data, arg, headers) => this.#newResponse(data, arg, headers), "body");
  text = /* @__PURE__ */ __name((text, arg, headers) => {
    return !this.#preparedHeaders && !this.#status && !arg && !headers && !this.finalized ? new Response(text) : this.#newResponse(
      text,
      arg,
      setDefaultContentType(TEXT_PLAIN, headers)
    );
  }, "text");
  json = /* @__PURE__ */ __name((object, arg, headers) => {
    return this.#newResponse(
      JSON.stringify(object),
      arg,
      setDefaultContentType("application/json", headers)
    );
  }, "json");
  html = /* @__PURE__ */ __name((html, arg, headers) => {
    const res = /* @__PURE__ */ __name((html2) => this.#newResponse(html2, arg, setDefaultContentType("text/html; charset=UTF-8", headers)), "res");
    return typeof html === "object" ? resolveCallback(html, HtmlEscapedCallbackPhase.Stringify, false, {}).then(res) : res(html);
  }, "html");
  redirect = /* @__PURE__ */ __name((location, status) => {
    const locationString = String(location);
    this.header(
      "Location",
      !/[^\x00-\xFF]/.test(locationString) ? locationString : encodeURI(locationString)
    );
    return this.newResponse(null, status ?? 302);
  }, "redirect");
  notFound = /* @__PURE__ */ __name(() => {
    this.#notFoundHandler ??= () => new Response();
    return this.#notFoundHandler(this);
  }, "notFound");
};

// node_modules/hono/dist/router.js
var METHOD_NAME_ALL = "ALL";
var METHOD_NAME_ALL_LOWERCASE = "all";
var METHODS = ["get", "post", "put", "delete", "options", "patch"];
var MESSAGE_MATCHER_IS_ALREADY_BUILT = "Can not add a route since the matcher is already built.";
var UnsupportedPathError = class extends Error {
  static {
    __name(this, "UnsupportedPathError");
  }
};

// node_modules/hono/dist/utils/constants.js
var COMPOSED_HANDLER = "__COMPOSED_HANDLER";

// node_modules/hono/dist/hono-base.js
var notFoundHandler = /* @__PURE__ */ __name((c) => {
  return c.text("404 Not Found", 404);
}, "notFoundHandler");
var errorHandler = /* @__PURE__ */ __name((err, c) => {
  if ("getResponse" in err) {
    const res = err.getResponse();
    return c.newResponse(res.body, res);
  }
  console.error(err);
  return c.text("Internal Server Error", 500);
}, "errorHandler");
var Hono = class {
  static {
    __name(this, "Hono");
  }
  get;
  post;
  put;
  delete;
  options;
  patch;
  all;
  on;
  use;
  router;
  getPath;
  _basePath = "/";
  #path = "/";
  routes = [];
  constructor(options = {}) {
    const allMethods = [...METHODS, METHOD_NAME_ALL_LOWERCASE];
    allMethods.forEach((method) => {
      this[method] = (args1, ...args) => {
        if (typeof args1 === "string") {
          this.#path = args1;
        } else {
          this.#addRoute(method, this.#path, args1);
        }
        args.forEach((handler) => {
          this.#addRoute(method, this.#path, handler);
        });
        return this;
      };
    });
    this.on = (method, path, ...handlers) => {
      for (const p of [path].flat()) {
        this.#path = p;
        for (const m of [method].flat()) {
          handlers.map((handler) => {
            this.#addRoute(m.toUpperCase(), this.#path, handler);
          });
        }
      }
      return this;
    };
    this.use = (arg1, ...handlers) => {
      if (typeof arg1 === "string") {
        this.#path = arg1;
      } else {
        this.#path = "*";
        handlers.unshift(arg1);
      }
      handlers.forEach((handler) => {
        this.#addRoute(METHOD_NAME_ALL, this.#path, handler);
      });
      return this;
    };
    const { strict, ...optionsWithoutStrict } = options;
    Object.assign(this, optionsWithoutStrict);
    this.getPath = strict ?? true ? options.getPath ?? getPath : getPathNoStrict;
  }
  #clone() {
    const clone = new Hono({
      router: this.router,
      getPath: this.getPath
    });
    clone.errorHandler = this.errorHandler;
    clone.#notFoundHandler = this.#notFoundHandler;
    clone.routes = this.routes;
    return clone;
  }
  #notFoundHandler = notFoundHandler;
  errorHandler = errorHandler;
  route(path, app2) {
    const subApp = this.basePath(path);
    app2.routes.map((r) => {
      let handler;
      if (app2.errorHandler === errorHandler) {
        handler = r.handler;
      } else {
        handler = /* @__PURE__ */ __name(async (c, next) => (await compose([], app2.errorHandler)(c, () => r.handler(c, next))).res, "handler");
        handler[COMPOSED_HANDLER] = r.handler;
      }
      subApp.#addRoute(r.method, r.path, handler);
    });
    return this;
  }
  basePath(path) {
    const subApp = this.#clone();
    subApp._basePath = mergePath(this._basePath, path);
    return subApp;
  }
  onError = /* @__PURE__ */ __name((handler) => {
    this.errorHandler = handler;
    return this;
  }, "onError");
  notFound = /* @__PURE__ */ __name((handler) => {
    this.#notFoundHandler = handler;
    return this;
  }, "notFound");
  mount(path, applicationHandler, options) {
    let replaceRequest;
    let optionHandler;
    if (options) {
      if (typeof options === "function") {
        optionHandler = options;
      } else {
        optionHandler = options.optionHandler;
        if (options.replaceRequest === false) {
          replaceRequest = /* @__PURE__ */ __name((request) => request, "replaceRequest");
        } else {
          replaceRequest = options.replaceRequest;
        }
      }
    }
    const getOptions = optionHandler ? (c) => {
      const options2 = optionHandler(c);
      return Array.isArray(options2) ? options2 : [options2];
    } : (c) => {
      let executionContext = void 0;
      try {
        executionContext = c.executionCtx;
      } catch {
      }
      return [c.env, executionContext];
    };
    replaceRequest ||= (() => {
      const mergedPath = mergePath(this._basePath, path);
      const pathPrefixLength = mergedPath === "/" ? 0 : mergedPath.length;
      return (request) => {
        const url = new URL(request.url);
        url.pathname = url.pathname.slice(pathPrefixLength) || "/";
        return new Request(url, request);
      };
    })();
    const handler = /* @__PURE__ */ __name(async (c, next) => {
      const res = await applicationHandler(replaceRequest(c.req.raw), ...getOptions(c));
      if (res) {
        return res;
      }
      await next();
    }, "handler");
    this.#addRoute(METHOD_NAME_ALL, mergePath(path, "*"), handler);
    return this;
  }
  #addRoute(method, path, handler) {
    method = method.toUpperCase();
    path = mergePath(this._basePath, path);
    const r = { basePath: this._basePath, path, method, handler };
    this.router.add(method, path, [handler, r]);
    this.routes.push(r);
  }
  #handleError(err, c) {
    if (err instanceof Error) {
      return this.errorHandler(err, c);
    }
    throw err;
  }
  #dispatch(request, executionCtx, env2, method) {
    if (method === "HEAD") {
      return (async () => new Response(null, await this.#dispatch(request, executionCtx, env2, "GET")))();
    }
    const path = this.getPath(request, { env: env2 });
    const matchResult = this.router.match(method, path);
    const c = new Context(request, {
      path,
      matchResult,
      env: env2,
      executionCtx,
      notFoundHandler: this.#notFoundHandler
    });
    if (matchResult[0].length === 1) {
      let res;
      try {
        res = matchResult[0][0][0][0](c, async () => {
          c.res = await this.#notFoundHandler(c);
        });
      } catch (err) {
        return this.#handleError(err, c);
      }
      return res instanceof Promise ? res.then(
        (resolved) => resolved || (c.finalized ? c.res : this.#notFoundHandler(c))
      ).catch((err) => this.#handleError(err, c)) : res ?? this.#notFoundHandler(c);
    }
    const composed = compose(matchResult[0], this.errorHandler, this.#notFoundHandler);
    return (async () => {
      try {
        const context2 = await composed(c);
        if (!context2.finalized) {
          throw new Error(
            "Context is not finalized. Did you forget to return a Response object or `await next()`?"
          );
        }
        return context2.res;
      } catch (err) {
        return this.#handleError(err, c);
      }
    })();
  }
  fetch = /* @__PURE__ */ __name((request, ...rest) => {
    return this.#dispatch(request, rest[1], rest[0], request.method);
  }, "fetch");
  request = /* @__PURE__ */ __name((input, requestInit, Env, executionCtx) => {
    if (input instanceof Request) {
      return this.fetch(requestInit ? new Request(input, requestInit) : input, Env, executionCtx);
    }
    input = input.toString();
    return this.fetch(
      new Request(
        /^https?:\/\//.test(input) ? input : `http://localhost${mergePath("/", input)}`,
        requestInit
      ),
      Env,
      executionCtx
    );
  }, "request");
  fire = /* @__PURE__ */ __name(() => {
    addEventListener("fetch", (event) => {
      event.respondWith(this.#dispatch(event.request, event, void 0, event.request.method));
    });
  }, "fire");
};

// node_modules/hono/dist/router/reg-exp-router/matcher.js
var emptyParam = [];
function match(method, path) {
  const matchers = this.buildAllMatchers();
  const match2 = /* @__PURE__ */ __name((method2, path2) => {
    const matcher = matchers[method2] || matchers[METHOD_NAME_ALL];
    const staticMatch = matcher[2][path2];
    if (staticMatch) {
      return staticMatch;
    }
    const match3 = path2.match(matcher[0]);
    if (!match3) {
      return [[], emptyParam];
    }
    const index = match3.indexOf("", 1);
    return [matcher[1][index], match3];
  }, "match2");
  this.match = match2;
  return match2(method, path);
}
__name(match, "match");

// node_modules/hono/dist/router/reg-exp-router/node.js
var LABEL_REG_EXP_STR = "[^/]+";
var ONLY_WILDCARD_REG_EXP_STR = ".*";
var TAIL_WILDCARD_REG_EXP_STR = "(?:|/.*)";
var PATH_ERROR = Symbol();
var regExpMetaChars = new Set(".\\+*[^]$()");
function compareKey(a, b) {
  if (a.length === 1) {
    return b.length === 1 ? a < b ? -1 : 1 : -1;
  }
  if (b.length === 1) {
    return 1;
  }
  if (a === ONLY_WILDCARD_REG_EXP_STR || a === TAIL_WILDCARD_REG_EXP_STR) {
    return 1;
  } else if (b === ONLY_WILDCARD_REG_EXP_STR || b === TAIL_WILDCARD_REG_EXP_STR) {
    return -1;
  }
  if (a === LABEL_REG_EXP_STR) {
    return 1;
  } else if (b === LABEL_REG_EXP_STR) {
    return -1;
  }
  return a.length === b.length ? a < b ? -1 : 1 : b.length - a.length;
}
__name(compareKey, "compareKey");
var Node = class {
  static {
    __name(this, "Node");
  }
  #index;
  #varIndex;
  #children = /* @__PURE__ */ Object.create(null);
  insert(tokens, index, paramMap, context2, pathErrorCheckOnly) {
    if (tokens.length === 0) {
      if (this.#index !== void 0) {
        throw PATH_ERROR;
      }
      if (pathErrorCheckOnly) {
        return;
      }
      this.#index = index;
      return;
    }
    const [token, ...restTokens] = tokens;
    const pattern = token === "*" ? restTokens.length === 0 ? ["", "", ONLY_WILDCARD_REG_EXP_STR] : ["", "", LABEL_REG_EXP_STR] : token === "/*" ? ["", "", TAIL_WILDCARD_REG_EXP_STR] : token.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
    let node;
    if (pattern) {
      const name = pattern[1];
      let regexpStr = pattern[2] || LABEL_REG_EXP_STR;
      if (name && pattern[2]) {
        if (regexpStr === ".*") {
          throw PATH_ERROR;
        }
        regexpStr = regexpStr.replace(/^\((?!\?:)(?=[^)]+\)$)/, "(?:");
        if (/\((?!\?:)/.test(regexpStr)) {
          throw PATH_ERROR;
        }
      }
      node = this.#children[regexpStr];
      if (!node) {
        if (Object.keys(this.#children).some(
          (k) => k !== ONLY_WILDCARD_REG_EXP_STR && k !== TAIL_WILDCARD_REG_EXP_STR
        )) {
          throw PATH_ERROR;
        }
        if (pathErrorCheckOnly) {
          return;
        }
        node = this.#children[regexpStr] = new Node();
        if (name !== "") {
          node.#varIndex = context2.varIndex++;
        }
      }
      if (!pathErrorCheckOnly && name !== "") {
        paramMap.push([name, node.#varIndex]);
      }
    } else {
      node = this.#children[token];
      if (!node) {
        if (Object.keys(this.#children).some(
          (k) => k.length > 1 && k !== ONLY_WILDCARD_REG_EXP_STR && k !== TAIL_WILDCARD_REG_EXP_STR
        )) {
          throw PATH_ERROR;
        }
        if (pathErrorCheckOnly) {
          return;
        }
        node = this.#children[token] = new Node();
      }
    }
    node.insert(restTokens, index, paramMap, context2, pathErrorCheckOnly);
  }
  buildRegExpStr() {
    const childKeys = Object.keys(this.#children).sort(compareKey);
    const strList = childKeys.map((k) => {
      const c = this.#children[k];
      return (typeof c.#varIndex === "number" ? `(${k})@${c.#varIndex}` : regExpMetaChars.has(k) ? `\\${k}` : k) + c.buildRegExpStr();
    });
    if (typeof this.#index === "number") {
      strList.unshift(`#${this.#index}`);
    }
    if (strList.length === 0) {
      return "";
    }
    if (strList.length === 1) {
      return strList[0];
    }
    return "(?:" + strList.join("|") + ")";
  }
};

// node_modules/hono/dist/router/reg-exp-router/trie.js
var Trie = class {
  static {
    __name(this, "Trie");
  }
  #context = { varIndex: 0 };
  #root = new Node();
  insert(path, index, pathErrorCheckOnly) {
    const paramAssoc = [];
    const groups = [];
    for (let i = 0; ; ) {
      let replaced = false;
      path = path.replace(/\{[^}]+\}/g, (m) => {
        const mark = `@\\${i}`;
        groups[i] = [mark, m];
        i++;
        replaced = true;
        return mark;
      });
      if (!replaced) {
        break;
      }
    }
    const tokens = path.match(/(?::[^\/]+)|(?:\/\*$)|./g) || [];
    for (let i = groups.length - 1; i >= 0; i--) {
      const [mark] = groups[i];
      for (let j = tokens.length - 1; j >= 0; j--) {
        if (tokens[j].indexOf(mark) !== -1) {
          tokens[j] = tokens[j].replace(mark, groups[i][1]);
          break;
        }
      }
    }
    this.#root.insert(tokens, index, paramAssoc, this.#context, pathErrorCheckOnly);
    return paramAssoc;
  }
  buildRegExp() {
    let regexp = this.#root.buildRegExpStr();
    if (regexp === "") {
      return [/^$/, [], []];
    }
    let captureIndex = 0;
    const indexReplacementMap = [];
    const paramReplacementMap = [];
    regexp = regexp.replace(/#(\d+)|@(\d+)|\.\*\$/g, (_, handlerIndex, paramIndex) => {
      if (handlerIndex !== void 0) {
        indexReplacementMap[++captureIndex] = Number(handlerIndex);
        return "$()";
      }
      if (paramIndex !== void 0) {
        paramReplacementMap[Number(paramIndex)] = ++captureIndex;
        return "";
      }
      return "";
    });
    return [new RegExp(`^${regexp}`), indexReplacementMap, paramReplacementMap];
  }
};

// node_modules/hono/dist/router/reg-exp-router/router.js
var nullMatcher = [/^$/, [], /* @__PURE__ */ Object.create(null)];
var wildcardRegExpCache = /* @__PURE__ */ Object.create(null);
function buildWildcardRegExp(path) {
  return wildcardRegExpCache[path] ??= new RegExp(
    path === "*" ? "" : `^${path.replace(
      /\/\*$|([.\\+*[^\]$()])/g,
      (_, metaChar) => metaChar ? `\\${metaChar}` : "(?:|/.*)"
    )}$`
  );
}
__name(buildWildcardRegExp, "buildWildcardRegExp");
function clearWildcardRegExpCache() {
  wildcardRegExpCache = /* @__PURE__ */ Object.create(null);
}
__name(clearWildcardRegExpCache, "clearWildcardRegExpCache");
function buildMatcherFromPreprocessedRoutes(routes) {
  const trie = new Trie();
  const handlerData = [];
  if (routes.length === 0) {
    return nullMatcher;
  }
  const routesWithStaticPathFlag = routes.map(
    (route) => [!/\*|\/:/.test(route[0]), ...route]
  ).sort(
    ([isStaticA, pathA], [isStaticB, pathB]) => isStaticA ? 1 : isStaticB ? -1 : pathA.length - pathB.length
  );
  const staticMap = /* @__PURE__ */ Object.create(null);
  for (let i = 0, j = -1, len = routesWithStaticPathFlag.length; i < len; i++) {
    const [pathErrorCheckOnly, path, handlers] = routesWithStaticPathFlag[i];
    if (pathErrorCheckOnly) {
      staticMap[path] = [handlers.map(([h]) => [h, /* @__PURE__ */ Object.create(null)]), emptyParam];
    } else {
      j++;
    }
    let paramAssoc;
    try {
      paramAssoc = trie.insert(path, j, pathErrorCheckOnly);
    } catch (e) {
      throw e === PATH_ERROR ? new UnsupportedPathError(path) : e;
    }
    if (pathErrorCheckOnly) {
      continue;
    }
    handlerData[j] = handlers.map(([h, paramCount]) => {
      const paramIndexMap = /* @__PURE__ */ Object.create(null);
      paramCount -= 1;
      for (; paramCount >= 0; paramCount--) {
        const [key, value] = paramAssoc[paramCount];
        paramIndexMap[key] = value;
      }
      return [h, paramIndexMap];
    });
  }
  const [regexp, indexReplacementMap, paramReplacementMap] = trie.buildRegExp();
  for (let i = 0, len = handlerData.length; i < len; i++) {
    for (let j = 0, len2 = handlerData[i].length; j < len2; j++) {
      const map = handlerData[i][j]?.[1];
      if (!map) {
        continue;
      }
      const keys = Object.keys(map);
      for (let k = 0, len3 = keys.length; k < len3; k++) {
        map[keys[k]] = paramReplacementMap[map[keys[k]]];
      }
    }
  }
  const handlerMap = [];
  for (const i in indexReplacementMap) {
    handlerMap[i] = handlerData[indexReplacementMap[i]];
  }
  return [regexp, handlerMap, staticMap];
}
__name(buildMatcherFromPreprocessedRoutes, "buildMatcherFromPreprocessedRoutes");
function findMiddleware(middleware, path) {
  if (!middleware) {
    return void 0;
  }
  for (const k of Object.keys(middleware).sort((a, b) => b.length - a.length)) {
    if (buildWildcardRegExp(k).test(path)) {
      return [...middleware[k]];
    }
  }
  return void 0;
}
__name(findMiddleware, "findMiddleware");
var RegExpRouter = class {
  static {
    __name(this, "RegExpRouter");
  }
  name = "RegExpRouter";
  #middleware;
  #routes;
  constructor() {
    this.#middleware = { [METHOD_NAME_ALL]: /* @__PURE__ */ Object.create(null) };
    this.#routes = { [METHOD_NAME_ALL]: /* @__PURE__ */ Object.create(null) };
  }
  add(method, path, handler) {
    const middleware = this.#middleware;
    const routes = this.#routes;
    if (!middleware || !routes) {
      throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
    }
    if (!middleware[method]) {
      ;
      [middleware, routes].forEach((handlerMap) => {
        handlerMap[method] = /* @__PURE__ */ Object.create(null);
        Object.keys(handlerMap[METHOD_NAME_ALL]).forEach((p) => {
          handlerMap[method][p] = [...handlerMap[METHOD_NAME_ALL][p]];
        });
      });
    }
    if (path === "/*") {
      path = "*";
    }
    const paramCount = (path.match(/\/:/g) || []).length;
    if (/\*$/.test(path)) {
      const re = buildWildcardRegExp(path);
      if (method === METHOD_NAME_ALL) {
        Object.keys(middleware).forEach((m) => {
          middleware[m][path] ||= findMiddleware(middleware[m], path) || findMiddleware(middleware[METHOD_NAME_ALL], path) || [];
        });
      } else {
        middleware[method][path] ||= findMiddleware(middleware[method], path) || findMiddleware(middleware[METHOD_NAME_ALL], path) || [];
      }
      Object.keys(middleware).forEach((m) => {
        if (method === METHOD_NAME_ALL || method === m) {
          Object.keys(middleware[m]).forEach((p) => {
            re.test(p) && middleware[m][p].push([handler, paramCount]);
          });
        }
      });
      Object.keys(routes).forEach((m) => {
        if (method === METHOD_NAME_ALL || method === m) {
          Object.keys(routes[m]).forEach(
            (p) => re.test(p) && routes[m][p].push([handler, paramCount])
          );
        }
      });
      return;
    }
    const paths = checkOptionalParameter(path) || [path];
    for (let i = 0, len = paths.length; i < len; i++) {
      const path2 = paths[i];
      Object.keys(routes).forEach((m) => {
        if (method === METHOD_NAME_ALL || method === m) {
          routes[m][path2] ||= [
            ...findMiddleware(middleware[m], path2) || findMiddleware(middleware[METHOD_NAME_ALL], path2) || []
          ];
          routes[m][path2].push([handler, paramCount - len + i + 1]);
        }
      });
    }
  }
  match = match;
  buildAllMatchers() {
    const matchers = /* @__PURE__ */ Object.create(null);
    Object.keys(this.#routes).concat(Object.keys(this.#middleware)).forEach((method) => {
      matchers[method] ||= this.#buildMatcher(method);
    });
    this.#middleware = this.#routes = void 0;
    clearWildcardRegExpCache();
    return matchers;
  }
  #buildMatcher(method) {
    const routes = [];
    let hasOwnRoute = method === METHOD_NAME_ALL;
    [this.#middleware, this.#routes].forEach((r) => {
      const ownRoute = r[method] ? Object.keys(r[method]).map((path) => [path, r[method][path]]) : [];
      if (ownRoute.length !== 0) {
        hasOwnRoute ||= true;
        routes.push(...ownRoute);
      } else if (method !== METHOD_NAME_ALL) {
        routes.push(
          ...Object.keys(r[METHOD_NAME_ALL]).map((path) => [path, r[METHOD_NAME_ALL][path]])
        );
      }
    });
    if (!hasOwnRoute) {
      return null;
    } else {
      return buildMatcherFromPreprocessedRoutes(routes);
    }
  }
};

// node_modules/hono/dist/router/smart-router/router.js
var SmartRouter = class {
  static {
    __name(this, "SmartRouter");
  }
  name = "SmartRouter";
  #routers = [];
  #routes = [];
  constructor(init) {
    this.#routers = init.routers;
  }
  add(method, path, handler) {
    if (!this.#routes) {
      throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
    }
    this.#routes.push([method, path, handler]);
  }
  match(method, path) {
    if (!this.#routes) {
      throw new Error("Fatal error");
    }
    const routers = this.#routers;
    const routes = this.#routes;
    const len = routers.length;
    let i = 0;
    let res;
    for (; i < len; i++) {
      const router = routers[i];
      try {
        for (let i2 = 0, len2 = routes.length; i2 < len2; i2++) {
          router.add(...routes[i2]);
        }
        res = router.match(method, path);
      } catch (e) {
        if (e instanceof UnsupportedPathError) {
          continue;
        }
        throw e;
      }
      this.match = router.match.bind(router);
      this.#routers = [router];
      this.#routes = void 0;
      break;
    }
    if (i === len) {
      throw new Error("Fatal error");
    }
    this.name = `SmartRouter + ${this.activeRouter.name}`;
    return res;
  }
  get activeRouter() {
    if (this.#routes || this.#routers.length !== 1) {
      throw new Error("No active router has been determined yet.");
    }
    return this.#routers[0];
  }
};

// node_modules/hono/dist/router/trie-router/node.js
var emptyParams = /* @__PURE__ */ Object.create(null);
var Node2 = class {
  static {
    __name(this, "Node");
  }
  #methods;
  #children;
  #patterns;
  #order = 0;
  #params = emptyParams;
  constructor(method, handler, children) {
    this.#children = children || /* @__PURE__ */ Object.create(null);
    this.#methods = [];
    if (method && handler) {
      const m = /* @__PURE__ */ Object.create(null);
      m[method] = { handler, possibleKeys: [], score: 0 };
      this.#methods = [m];
    }
    this.#patterns = [];
  }
  insert(method, path, handler) {
    this.#order = ++this.#order;
    let curNode = this;
    const parts = splitRoutingPath(path);
    const possibleKeys = [];
    for (let i = 0, len = parts.length; i < len; i++) {
      const p = parts[i];
      const nextP = parts[i + 1];
      const pattern = getPattern(p, nextP);
      const key = Array.isArray(pattern) ? pattern[0] : p;
      if (key in curNode.#children) {
        curNode = curNode.#children[key];
        if (pattern) {
          possibleKeys.push(pattern[1]);
        }
        continue;
      }
      curNode.#children[key] = new Node2();
      if (pattern) {
        curNode.#patterns.push(pattern);
        possibleKeys.push(pattern[1]);
      }
      curNode = curNode.#children[key];
    }
    curNode.#methods.push({
      [method]: {
        handler,
        possibleKeys: possibleKeys.filter((v, i, a) => a.indexOf(v) === i),
        score: this.#order
      }
    });
    return curNode;
  }
  #getHandlerSets(node, method, nodeParams, params) {
    const handlerSets = [];
    for (let i = 0, len = node.#methods.length; i < len; i++) {
      const m = node.#methods[i];
      const handlerSet = m[method] || m[METHOD_NAME_ALL];
      const processedSet = {};
      if (handlerSet !== void 0) {
        handlerSet.params = /* @__PURE__ */ Object.create(null);
        handlerSets.push(handlerSet);
        if (nodeParams !== emptyParams || params && params !== emptyParams) {
          for (let i2 = 0, len2 = handlerSet.possibleKeys.length; i2 < len2; i2++) {
            const key = handlerSet.possibleKeys[i2];
            const processed = processedSet[handlerSet.score];
            handlerSet.params[key] = params?.[key] && !processed ? params[key] : nodeParams[key] ?? params?.[key];
            processedSet[handlerSet.score] = true;
          }
        }
      }
    }
    return handlerSets;
  }
  search(method, path) {
    const handlerSets = [];
    this.#params = emptyParams;
    const curNode = this;
    let curNodes = [curNode];
    const parts = splitPath(path);
    const curNodesQueue = [];
    for (let i = 0, len = parts.length; i < len; i++) {
      const part = parts[i];
      const isLast = i === len - 1;
      const tempNodes = [];
      for (let j = 0, len2 = curNodes.length; j < len2; j++) {
        const node = curNodes[j];
        const nextNode = node.#children[part];
        if (nextNode) {
          nextNode.#params = node.#params;
          if (isLast) {
            if (nextNode.#children["*"]) {
              handlerSets.push(
                ...this.#getHandlerSets(nextNode.#children["*"], method, node.#params)
              );
            }
            handlerSets.push(...this.#getHandlerSets(nextNode, method, node.#params));
          } else {
            tempNodes.push(nextNode);
          }
        }
        for (let k = 0, len3 = node.#patterns.length; k < len3; k++) {
          const pattern = node.#patterns[k];
          const params = node.#params === emptyParams ? {} : { ...node.#params };
          if (pattern === "*") {
            const astNode = node.#children["*"];
            if (astNode) {
              handlerSets.push(...this.#getHandlerSets(astNode, method, node.#params));
              astNode.#params = params;
              tempNodes.push(astNode);
            }
            continue;
          }
          const [key, name, matcher] = pattern;
          if (!part && !(matcher instanceof RegExp)) {
            continue;
          }
          const child = node.#children[key];
          const restPathString = parts.slice(i).join("/");
          if (matcher instanceof RegExp) {
            const m = matcher.exec(restPathString);
            if (m) {
              params[name] = m[0];
              handlerSets.push(...this.#getHandlerSets(child, method, node.#params, params));
              if (Object.keys(child.#children).length) {
                child.#params = params;
                const componentCount = m[0].match(/\//)?.length ?? 0;
                const targetCurNodes = curNodesQueue[componentCount] ||= [];
                targetCurNodes.push(child);
              }
              continue;
            }
          }
          if (matcher === true || matcher.test(part)) {
            params[name] = part;
            if (isLast) {
              handlerSets.push(...this.#getHandlerSets(child, method, params, node.#params));
              if (child.#children["*"]) {
                handlerSets.push(
                  ...this.#getHandlerSets(child.#children["*"], method, params, node.#params)
                );
              }
            } else {
              child.#params = params;
              tempNodes.push(child);
            }
          }
        }
      }
      curNodes = tempNodes.concat(curNodesQueue.shift() ?? []);
    }
    if (handlerSets.length > 1) {
      handlerSets.sort((a, b) => {
        return a.score - b.score;
      });
    }
    return [handlerSets.map(({ handler, params }) => [handler, params])];
  }
};

// node_modules/hono/dist/router/trie-router/router.js
var TrieRouter = class {
  static {
    __name(this, "TrieRouter");
  }
  name = "TrieRouter";
  #node;
  constructor() {
    this.#node = new Node2();
  }
  add(method, path, handler) {
    const results = checkOptionalParameter(path);
    if (results) {
      for (let i = 0, len = results.length; i < len; i++) {
        this.#node.insert(method, results[i], handler);
      }
      return;
    }
    this.#node.insert(method, path, handler);
  }
  match(method, path) {
    return this.#node.search(method, path);
  }
};

// node_modules/hono/dist/hono.js
var Hono2 = class extends Hono {
  static {
    __name(this, "Hono");
  }
  constructor(options = {}) {
    super(options);
    this.router = options.router ?? new SmartRouter({
      routers: [new RegExpRouter(), new TrieRouter()]
    });
  }
};

// node_modules/hono/dist/middleware/cors/index.js
var cors = /* @__PURE__ */ __name((options) => {
  const defaults = {
    origin: "*",
    allowMethods: ["GET", "HEAD", "PUT", "POST", "DELETE", "PATCH"],
    allowHeaders: [],
    exposeHeaders: []
  };
  const opts = {
    ...defaults,
    ...options
  };
  const findAllowOrigin = ((optsOrigin) => {
    if (typeof optsOrigin === "string") {
      if (optsOrigin === "*") {
        return () => optsOrigin;
      } else {
        return (origin) => optsOrigin === origin ? origin : null;
      }
    } else if (typeof optsOrigin === "function") {
      return optsOrigin;
    } else {
      return (origin) => optsOrigin.includes(origin) ? origin : null;
    }
  })(opts.origin);
  const findAllowMethods = ((optsAllowMethods) => {
    if (typeof optsAllowMethods === "function") {
      return optsAllowMethods;
    } else if (Array.isArray(optsAllowMethods)) {
      return () => optsAllowMethods;
    } else {
      return () => [];
    }
  })(opts.allowMethods);
  return /* @__PURE__ */ __name(async function cors2(c, next) {
    function set(key, value) {
      c.res.headers.set(key, value);
    }
    __name(set, "set");
    const allowOrigin = await findAllowOrigin(c.req.header("origin") || "", c);
    if (allowOrigin) {
      set("Access-Control-Allow-Origin", allowOrigin);
    }
    if (opts.credentials) {
      set("Access-Control-Allow-Credentials", "true");
    }
    if (opts.exposeHeaders?.length) {
      set("Access-Control-Expose-Headers", opts.exposeHeaders.join(","));
    }
    if (c.req.method === "OPTIONS") {
      if (opts.origin !== "*") {
        set("Vary", "Origin");
      }
      if (opts.maxAge != null) {
        set("Access-Control-Max-Age", opts.maxAge.toString());
      }
      const allowMethods = await findAllowMethods(c.req.header("origin") || "", c);
      if (allowMethods.length) {
        set("Access-Control-Allow-Methods", allowMethods.join(","));
      }
      let headers = opts.allowHeaders;
      if (!headers?.length) {
        const requestHeaders = c.req.header("Access-Control-Request-Headers");
        if (requestHeaders) {
          headers = requestHeaders.split(/\s*,\s*/);
        }
      }
      if (headers?.length) {
        set("Access-Control-Allow-Headers", headers.join(","));
        c.res.headers.append("Vary", "Access-Control-Request-Headers");
      }
      c.res.headers.delete("Content-Length");
      c.res.headers.delete("Content-Type");
      return new Response(null, {
        headers: c.res.headers,
        status: 204,
        statusText: "No Content"
      });
    }
    await next();
    if (opts.origin !== "*") {
      c.header("Vary", "Origin", { append: true });
    }
  }, "cors2");
}, "cors");

// src/utils/analytics.js
async function writeCacheMetrics(env2, metrics) {
  if (!env2.CACHE_ANALYTICS) {
    console.warn("CACHE_ANALYTICS binding not available");
    return;
  }
  try {
    const blobs = metrics.isbn ? [metrics.isbn, "isbn_search"] : [metrics.endpoint, metrics.imageQuality];
    const indexes = metrics.isbn ? ["google-books-isbn"] : [metrics.cacheHit ? "HIT" : "MISS"];
    await env2.CACHE_ANALYTICS.writeDataPoint({
      blobs,
      doubles: [
        metrics.responseTime,
        metrics.dataCompleteness,
        metrics.itemCount
      ],
      indexes
    });
  } catch (error3) {
    console.error("Failed to write cache metrics:", error3);
  }
}
__name(writeCacheMetrics, "writeCacheMetrics");
function trackRequestMetrics(env2, endpoint, statusCode, processingTime, errorCode = null, cacheStatus = "MISS") {
  try {
    if (!env2.PERFORMANCE_ANALYTICS) return;
    env2.PERFORMANCE_ANALYTICS.writeDataPoint({
      blobs: [endpoint, errorCode || "N/A", cacheStatus],
      doubles: [statusCode, processingTime],
      indexes: [endpoint]
      // For efficient querying by endpoint
    });
  } catch (error3) {
    console.error("[Analytics] Failed to track metrics:", error3);
  }
}
__name(trackRequestMetrics, "trackRequestMetrics");
function addAnalyticsHeaders(response, startTime, cacheStatus = "MISS", errorCode = null) {
  const processingTime = Date.now() - startTime;
  const headers = new Headers(response.headers);
  headers.set("X-Response-Time", `${processingTime}ms`);
  headers.set("X-Cache-Status", cacheStatus);
  if (errorCode) {
    headers.set("X-Error-Code", errorCode);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
__name(addAnalyticsHeaders, "addAnalyticsHeaders");

// src/handlers/v1/search-isbn.ts
var ISBN10_REGEX = /^\d{9}[\dX]$/i;
var ISBN13_REGEX = /^\d{13}$/;
function isValidISBN10Checksum(cleanedIsbn) {
  if (cleanedIsbn.length !== 10 || !ISBN10_REGEX.test(cleanedIsbn)) {
    return false;
  }
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cleanedIsbn[i], 10) * (10 - i);
  }
  const checkChar = cleanedIsbn[9].toUpperCase();
  const checkDigit = checkChar === "X" ? 10 : parseInt(checkChar, 10);
  return (sum + checkDigit) % 11 === 0;
}
__name(isValidISBN10Checksum, "isValidISBN10Checksum");
function isValidISBN13Checksum(cleanedIsbn) {
  if (cleanedIsbn.length !== 13 || !ISBN13_REGEX.test(cleanedIsbn)) {
    return false;
  }
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(cleanedIsbn[i], 10);
    sum += i % 2 === 0 ? digit : digit * 3;
  }
  const checkDigit = parseInt(cleanedIsbn[12], 10);
  const calculatedCheckDigit = (10 - sum % 10) % 10;
  return calculatedCheckDigit === checkDigit;
}
__name(isValidISBN13Checksum, "isValidISBN13Checksum");
function isValidISBN(isbn) {
  if (!isbn || isbn.trim().length === 0) return false;
  const cleaned = isbn.replace(/[-\s]/g, "");
  if (cleaned.length === 13 && ISBN13_REGEX.test(cleaned)) {
    return isValidISBN13Checksum(cleaned);
  }
  if (cleaned.length === 10 && ISBN10_REGEX.test(cleaned)) {
    return isValidISBN10Checksum(cleaned);
  }
  return false;
}
__name(isValidISBN, "isValidISBN");
async function handleSearchISBN(isbn, env2, request = null) {
  const startTime = Date.now();
  if (!isbn || isbn.trim().length === 0) {
    return createErrorResponse(
      "ISBN is required",
      400,
      ErrorCodes.INVALID_ISBN,
      { isbn },
      request
    );
  }
  if (!isValidISBN(isbn)) {
    return createErrorResponse(
      "Invalid ISBN format. Must be valid ISBN-10 or ISBN-13",
      400,
      ErrorCodes.INVALID_ISBN,
      { isbn },
      request
    );
  }
  try {
    const normalizedISBN = normalizeISBN(isbn);
    console.log(
      `v1 ISBN search for "${isbn}" (normalized: "${normalizedISBN}") (using enrichMultipleBooks)`
    );
    const result = await enrichMultipleBooks({ isbn: normalizedISBN }, env2, {
      maxResults: 1
    });
    const processingTime = Date.now() - startTime;
    if (!result || !result.works || result.works.length === 0) {
      await writeCacheMetrics(env2, {
        endpoint: "/v1/search/isbn",
        isbn: normalizedISBN,
        cacheHit: false,
        responseTime: processingTime,
        imageQuality: "NONE",
        dataCompleteness: 0,
        itemCount: 0
      });
      return createSuccessResponse(
        { works: [], editions: [], authors: [], resultCount: 0 },
        {
          processingTime,
          provider: "none",
          cached: false
        },
        200,
        request
      );
    }
    const baseAuthors = extractUniqueAuthors(result.works);
    const authors = await enrichAuthorsWithCulturalData(baseAuthors, env2);
    const cleanWorks = removeAuthorsFromWorks(result.works);
    const work = cleanWorks[0];
    const hasCovers = work?.coverImageURL || result.editions?.some((e) => e.coverURL);
    await writeCacheMetrics(env2, {
      endpoint: "/v1/search/isbn",
      isbn: normalizedISBN,
      cacheHit: false,
      // enrichMultipleBooks doesn't use cache (direct API calls)
      responseTime: processingTime,
      imageQuality: hasCovers ? "MEDIUM" : "NONE",
      dataCompleteness: work ? 75 : 0,
      // Simplified: assume 75% completeness for found books
      itemCount: cleanWorks.length
    });
    return createSuccessResponse(
      {
        works: cleanWorks,
        editions: result.editions,
        authors,
        resultCount: cleanWorks.length
      },
      {
        processingTime,
        provider: work?.primaryProvider,
        // Use actual provider from enriched work
        cached: false
      },
      200,
      request
    );
  } catch (error3) {
    console.error("Error in v1 ISBN search:", error3);
    return createErrorResponse(
      error3.message || "Internal server error",
      500,
      ErrorCodes.INTERNAL_ERROR,
      { error: error3.toString(), processingTime: Date.now() - startTime },
      request
    );
  }
}
__name(handleSearchISBN, "handleSearchISBN");

// src/handlers/v1/search-title.ts
async function handleSearchTitle(query, env2, request = null) {
  const startTime = Date.now();
  if (!query || query.trim().length === 0) {
    return createErrorResponse(
      "Search query is required",
      400,
      ErrorCodes.INVALID_QUERY,
      { query },
      request
    );
  }
  try {
    const normalizedTitle = normalizeTitle(query);
    console.log(
      `v1 title search for "${query}" (normalized: "${normalizedTitle}") (using enrichMultipleBooks, maxResults: 20)`
    );
    const result = await enrichMultipleBooks({ title: normalizedTitle }, env2, {
      maxResults: 20
    });
    if (!result || !result.works || result.works.length === 0) {
      return createSuccessResponse(
        { works: [], editions: [], authors: [], resultCount: 0 },
        {
          processingTime: Date.now() - startTime,
          provider: "none",
          cached: false
        },
        200,
        request
      );
    }
    const baseAuthors = extractUniqueAuthors(result.works);
    const authors = await enrichAuthorsWithCulturalData(baseAuthors, env2);
    const cleanWorks = removeAuthorsFromWorks(result.works);
    return createSuccessResponse(
      {
        works: cleanWorks,
        editions: result.editions,
        authors,
        resultCount: cleanWorks.length
      },
      {
        processingTime: Date.now() - startTime,
        provider: cleanWorks[0]?.primaryProvider,
        // Use actual provider from enriched work
        cached: false
      },
      200,
      request
    );
  } catch (error3) {
    console.error("Error in v1 title search:", error3);
    return createErrorResponse(
      error3.message || "Internal server error",
      500,
      ErrorCodes.INTERNAL_ERROR,
      { error: error3.toString(), processingTime: Date.now() - startTime },
      request
    );
  }
}
__name(handleSearchTitle, "handleSearchTitle");

// src/handlers/batch-enrichment.ts
async function handleBatchEnrichment(request, env2, ctx) {
  try {
    const { books, jobId } = await request.json();
    if (!books || !Array.isArray(books)) {
      return createErrorResponse(
        "Invalid books array",
        400,
        ErrorCodes.INVALID_REQUEST
      );
    }
    if (!jobId) {
      return createErrorResponse(
        "Missing jobId",
        400,
        ErrorCodes.INVALID_REQUEST
      );
    }
    if (books.length === 0) {
      return createErrorResponse(
        "Empty books array",
        400,
        ErrorCodes.EMPTY_BATCH
      );
    }
    if (books.length > 100) {
      return createErrorResponse(
        "Batch size exceeds maximum of 100 books",
        400,
        ErrorCodes.BATCH_TOO_LARGE
      );
    }
    for (let i = 0; i < books.length; i++) {
      const book = books[i];
      if (!book.title || typeof book.title !== "string") {
        return createErrorResponse(
          `Invalid title for book at index ${i}`,
          400,
          ErrorCodes.INVALID_REQUEST
        );
      }
      if (book.title.length > 500) {
        return createErrorResponse(
          `Title exceeds maximum length of 500 characters at index ${i}`,
          400,
          ErrorCodes.INVALID_REQUEST
        );
      }
      if (book.author && typeof book.author !== "string") {
        return createErrorResponse(
          `Invalid author for book at index ${i}`,
          400,
          ErrorCodes.INVALID_REQUEST
        );
      }
      if (book.author && book.author.length > 300) {
        return createErrorResponse(
          `Author exceeds maximum length of 300 characters at index ${i}`,
          400,
          ErrorCodes.INVALID_REQUEST
        );
      }
      if (book.isbn && typeof book.isbn !== "string") {
        return createErrorResponse(
          `Invalid ISBN for book at index ${i}`,
          400,
          ErrorCodes.INVALID_ISBN
        );
      }
      if (book.isbn && book.isbn.length > 17) {
        return createErrorResponse(
          `ISBN exceeds maximum length of 17 characters at index ${i}`,
          400,
          ErrorCodes.INVALID_ISBN
        );
      }
      book.title = book.title.trim();
      if (book.author) book.author = book.author.trim();
      if (book.isbn) book.isbn = book.isbn.trim();
    }
    const doId = env2.PROGRESS_WEBSOCKET_DO.idFromName(jobId);
    const doStub = env2.PROGRESS_WEBSOCKET_DO.get(doId);
    const authToken = crypto.randomUUID();
    await doStub.setAuthToken(authToken);
    console.log(`[Batch Enrichment] Auth token generated for job ${jobId}`);
    await doStub.initializeJobState("batch_enrichment", books.length);
    ctx.waitUntil(processBatchEnrichment(books, doStub, env2, jobId));
    const initResponse = {
      success: true,
      processedCount: 0,
      totalCount: books.length,
      token: authToken
      // WebSocket authentication token
    };
    return createSuccessResponse(initResponse, {}, 202);
  } catch (error3) {
    return createErrorResponse(error3.message, 500, ErrorCodes.INTERNAL_ERROR);
  }
}
__name(handleBatchEnrichment, "handleBatchEnrichment");
async function processBatchEnrichment(books, doStub, env2, jobId) {
  const startTime = Date.now();
  try {
    const enrichedBooks = await enrichBooksParallel(
      books,
      async (book) => {
        const enriched = await enrichSingleBook(
          {
            title: book.title,
            author: book.author,
            isbn: book.isbn
          },
          env2
        );
        if (enriched) {
          return {
            title: book.title,
            author: book.author,
            isbn: book.isbn,
            success: true,
            enriched: {
              work: enriched.work,
              edition: enriched.edition,
              authors: enriched.authors || []
            }
          };
        } else {
          return {
            title: book.title,
            author: book.author,
            isbn: book.isbn,
            success: false,
            error: "Book not found in any provider"
          };
        }
      },
      async (completed, total, title2, hasError) => {
        const progress = completed / total;
        const status = hasError ? `Enriching (${completed}/${total}): ${title2} [failed]` : `Enriching (${completed}/${total}): ${title2}`;
        await doStub.updateProgress("batch_enrichment", {
          progress,
          status,
          processedCount: completed,
          currentItem: title2
        });
      },
      10
      // Concurrency limit
    );
    const totalProcessed = enrichedBooks.length;
    const successCount = enrichedBooks.filter((b) => b.success === true).length;
    const failureCount = totalProcessed - successCount;
    const duration = Date.now() - startTime;
    const resourceId = `job-results:${jobId}`;
    await env2.KV_CACHE.put(
      resourceId,
      JSON.stringify(enrichedBooks),
      { expirationTtl: 3600 }
      // 1 hour
    );
    await doStub.complete("batch_enrichment", {
      summary: {
        totalProcessed,
        successCount,
        failureCount,
        duration,
        resourceId
      }
    });
  } catch (error3) {
    await doStub.sendError("batch_enrichment", {
      code: "E_BATCH_PROCESSING_FAILED",
      message: error3.message,
      retryable: true
    });
  }
}
__name(processBatchEnrichment, "processBatchEnrichment");

// src/handlers/batch-scan-handler.ts
var MAX_PHOTOS_PER_BATCH = 5;
var MAX_IMAGE_SIZE = 1e7;
function clampBoundingBox(bbox) {
  if (!bbox || typeof bbox !== "object") return void 0;
  const clamp = /* @__PURE__ */ __name((val) => Math.max(0, Math.min(1, val)), "clamp");
  return {
    x: clamp(Number(bbox.x) || 0),
    y: clamp(Number(bbox.y) || 0),
    width: clamp(Number(bbox.width) || 0),
    height: clamp(Number(bbox.height) || 0)
  };
}
__name(clampBoundingBox, "clampBoundingBox");
function mapToDetectedBook(book) {
  return {
    title: book?.title,
    author: book?.author,
    isbn: book?.isbn,
    confidence: book?.confidence,
    boundingBox: clampBoundingBox(book?.boundingBox),
    // Validate and clamp to [0,1]
    enrichmentStatus: book?.enrichment?.status || book?.enrichmentStatus || "pending",
    // Deprecated flat fields (kept for backwards compatibility)
    coverUrl: book?.enrichment?.work?.coverImageURL || book?.coverUrl || null,
    publisher: book?.enrichment?.editions?.[0]?.publisher || book?.publisher || null,
    publicationYear: book?.enrichment?.editions?.[0]?.publicationYear || book?.publicationYear || null,
    // Nested enrichment data (canonical DTOs) - FIX for enrichment loss
    enrichment: book?.enrichment || void 0
  };
}
__name(mapToDetectedBook, "mapToDetectedBook");
async function handleBatchScan(request, env2, ctx) {
  try {
    let clientDisconnected = false;
    request.signal?.addEventListener("abort", () => {
      clientDisconnected = true;
      console.log("[Batch Scan] Client disconnected during job initialization");
    });
    const { jobId, images } = await request.json();
    if (!jobId || !images || !Array.isArray(images)) {
      return createErrorResponse(
        "Invalid request: jobId and images array required",
        400,
        ErrorCodes.INVALID_REQUEST
      );
    }
    if (images.length === 0) {
      return createErrorResponse(
        "At least one image required",
        400,
        ErrorCodes.INVALID_REQUEST
      );
    }
    if (images.length > MAX_PHOTOS_PER_BATCH) {
      return createErrorResponse(
        `Batch size exceeds maximum ${MAX_PHOTOS_PER_BATCH} photos`,
        400,
        ErrorCodes.BATCH_TOO_LARGE
      );
    }
    if (!env2.BOOKSHELF_IMAGES) {
      console.error("R2 binding BOOKSHELF_IMAGES not configured");
      return createErrorResponse(
        "Storage not configured",
        500,
        ErrorCodes.INTERNAL_ERROR
      );
    }
    const MAX_BATCH_SIZE = 5e7;
    let totalBatchSize = 0;
    const processedImages = [];
    for (const img of images) {
      if (typeof img.index !== "number" || !img.data) {
        return createErrorResponse(
          "Each image must have index and data fields",
          400,
          ErrorCodes.INVALID_REQUEST
        );
      }
      let decodedBuffer;
      try {
        decodedBuffer = Buffer.from(img.data, "base64");
      } catch (error3) {
        return createErrorResponse(
          `Image ${img.index} has invalid base64 data: ${error3.message}`,
          400,
          ErrorCodes.INVALID_REQUEST
        );
      }
      const actualSize = decodedBuffer.byteLength;
      if (actualSize > MAX_IMAGE_SIZE) {
        return createErrorResponse(
          `Image ${img.index} exceeds maximum size of ${MAX_IMAGE_SIZE / 1e6}MB (actual: ${(actualSize / 1e6).toFixed(1)}MB)`,
          413,
          ErrorCodes.FILE_TOO_LARGE
        );
      }
      totalBatchSize += actualSize;
      processedImages.push({ index: img.index, buffer: decodedBuffer });
    }
    if (totalBatchSize > MAX_BATCH_SIZE) {
      return createErrorResponse(
        `Total batch size exceeds maximum of ${MAX_BATCH_SIZE / 1e6}MB (actual: ${(totalBatchSize / 1e6).toFixed(1)}MB)`,
        413,
        ErrorCodes.FILE_TOO_LARGE
      );
    }
    const doId = env2.PROGRESS_WEBSOCKET_DO.idFromName(jobId);
    const doStub = env2.PROGRESS_WEBSOCKET_DO.get(doId);
    const authToken = crypto.randomUUID();
    await doStub.setAuthToken(authToken);
    console.log(`[Batch Scan] Auth token generated for job ${jobId}`);
    if (clientDisconnected) {
      console.log(
        `[Batch Scan] Skipping job ${jobId} - client disconnected before processing started`
      );
      return createErrorResponse(
        "Client disconnected",
        499,
        ErrorCodes.CLIENT_DISCONNECTED
      );
    }
    await doStub.initializeJobState("ai_scan", images.length);
    ctx.waitUntil(processBatchPhotos(jobId, images, env2, doStub));
    const initResponse = {
      jobId,
      token: authToken,
      // WebSocket authentication token
      totalPhotos: images.length,
      status: "processing"
    };
    return createSuccessResponse(initResponse, {}, 202);
  } catch (error3) {
    console.error("Batch scan error:", error3);
    return createErrorResponse(
      "Internal server error",
      500,
      ErrorCodes.INTERNAL_ERROR
    );
  }
}
__name(handleBatchScan, "handleBatchScan");
async function processBatchPhotos(jobId, images, env2, doStub) {
  const startTime = Date.now();
  const allBooks = [];
  const photoResults = [];
  try {
    const uploadPromises = images.map(async (img, idx) => {
      try {
        const imageBuffer = Buffer.from(img.data, "base64");
        const r2Key = `bookshelf-scans/${jobId}/photo-${idx}.jpg`;
        await env2.BOOKSHELF_IMAGES.put(r2Key, imageBuffer, {
          httpMetadata: { contentType: "image/jpeg" }
        });
        return { index: idx, r2Key, success: true };
      } catch (error3) {
        console.error(`Upload failed for photo ${idx}:`, error3);
        return { index: idx, success: false, error: error3.message };
      }
    });
    const uploadResults = await Promise.all(uploadPromises);
    await doStub.updateProgress("ai_scan", {
      progress: 0.1,
      status: "Photos uploaded, starting AI processing...",
      processedCount: 0,
      currentItem: `Uploaded ${uploadResults.length} photos`
    });
    for (let i = 0; i < uploadResults.length; i++) {
      const upload = uploadResults[i];
      if (!upload.success) {
        photoResults.push({
          index: i,
          status: "error",
          error: upload.error
        });
        continue;
      }
      const { canceled: isCanceled } = await doStub.isBatchCanceled();
      if (isCanceled) {
        console.log(
          `Job ${jobId} canceled at photo ${i}, returning partial results`
        );
        const partialBooks = deduplicateBooks(allBooks);
        await doStub.updateProgress("ai_scan", {
          progress: 0.8,
          status: `Job canceled, enriching ${partialBooks.length} partial results...`,
          processedCount: i,
          currentItem: "Enrichment phase"
        });
        const enrichedPartialBooks = await enrichBooksParallel(
          partialBooks,
          async (book) => {
            const apiResponse = await handleSearchAdvanced(
              book.title || "",
              book.author || "",
              env2
            );
            if (apiResponse.success) {
              const work = apiResponse.data.works?.[0] || null;
              const editions = apiResponse.data.editions || [];
              const authors = apiResponse.data.authors || [];
              return {
                ...book,
                enrichment: {
                  status: work ? "success" : "not_found",
                  work,
                  editions,
                  authors,
                  provider: apiResponse.meta.provider,
                  cachedResult: apiResponse.meta.cached || false
                }
              };
            } else {
              return {
                ...book,
                enrichment: {
                  status: "error",
                  error: apiResponse.error.message,
                  work: null,
                  editions: [],
                  authors: []
                }
              };
            }
          },
          async (completed, total, title2, hasError) => {
            const enrichProgress = 0.8 + 0.2 * (completed / total);
            await doStub.updateProgress("ai_scan", {
              progress: enrichProgress,
              status: hasError ? `Enriching canceled job results... (${completed}/${total}, ${title2} failed)` : `Enriching canceled job results... (${completed}/${total})`,
              processedCount: completed,
              currentItem: title2 || "Unknown title"
            });
          },
          10
          // maxConcurrent
        );
        const approvedCount2 = enrichedPartialBooks.filter(
          (b) => b.confidence >= 0.6
        ).length;
        const reviewCount2 = enrichedPartialBooks.filter(
          (b) => b.confidence < 0.6
        ).length;
        await doStub.updateProgress("ai_scan", {
          progress: 1,
          status: "Job canceled, returning partial results...",
          processedCount: enrichedPartialBooks.length,
          currentItem: "Finalizing"
        });
        const resourceId2 = `job-results:${jobId}`;
        await env2.KV_CACHE.put(
          resourceId2,
          JSON.stringify(enrichedPartialBooks.map(mapToDetectedBook)),
          { expirationTtl: 3600 }
          // 1 hour
        );
        await doStub.complete("ai_scan", {
          summary: {
            totalProcessed: enrichedPartialBooks.length,
            successCount: approvedCount2,
            failureCount: reviewCount2,
            duration: Date.now() - startTime,
            resourceId: resourceId2,
            totalDetected: enrichedPartialBooks.length,
            approved: approvedCount2,
            needsReview: reviewCount2
          }
        });
        return;
      }
      const progress = (i + 0.5) / uploadResults.length;
      await doStub.updateProgress("ai_scan", {
        progress,
        status: `Processing photo ${i + 1} of ${uploadResults.length}...`,
        processedCount: i,
        currentItem: `Photo ${i + 1}`
      });
      try {
        const r2Object = await env2.BOOKSHELF_IMAGES.get(upload.r2Key);
        const imageBuffer = await r2Object.arrayBuffer();
        const result = await scanImageWithGemini(imageBuffer, env2);
        photoResults.push({
          index: i,
          status: "complete",
          booksFound: result.books.length
        });
        allBooks.push(...result.books);
        const completionProgress = (i + 1) / uploadResults.length;
        await doStub.updateProgress("ai_scan", {
          progress: completionProgress,
          status: `Completed photo ${i + 1} of ${uploadResults.length} - Found ${result.books.length} books`,
          processedCount: i + 1,
          currentItem: `Photo ${i + 1}: ${result.books.length} books`
        });
      } catch (error3) {
        console.error(`Processing failed for photo ${i}:`, error3);
        photoResults.push({
          index: i,
          status: "error",
          error: error3.message
        });
        const errorProgress = (i + 1) / uploadResults.length;
        await doStub.updateProgress("ai_scan", {
          progress: errorProgress,
          status: `Error processing photo ${i + 1}: ${error3.message}`,
          processedCount: i + 1,
          currentItem: `Photo ${i + 1}: Error`
        });
      }
    }
    const uniqueBooks = deduplicateBooks(allBooks);
    await doStub.updateProgress("ai_scan", {
      progress: 0.8,
      status: `Enriching ${uniqueBooks.length} books with metadata...`,
      processedCount: uploadResults.length,
      currentItem: "Enrichment phase"
    });
    const enrichedBooks = await enrichBooksParallel(
      uniqueBooks,
      async (book) => {
        const apiResponse = await handleSearchAdvanced(
          book.title || "",
          book.author || "",
          env2
        );
        if (apiResponse.success) {
          const work = apiResponse.data.works?.[0] || null;
          const editions = apiResponse.data.editions || [];
          const authors = apiResponse.data.authors || [];
          return {
            ...book,
            enrichment: {
              status: work ? "success" : "not_found",
              work,
              editions,
              authors,
              provider: apiResponse.meta.provider,
              cachedResult: apiResponse.meta.cached || false
            }
          };
        } else {
          return {
            ...book,
            enrichment: {
              status: "error",
              error: apiResponse.error.message,
              work: null,
              editions: [],
              authors: []
            }
          };
        }
      },
      async (completed, total, title2, hasError) => {
        const enrichProgress = 0.8 + 0.2 * (completed / total);
        await doStub.updateProgress("ai_scan", {
          progress: enrichProgress,
          status: hasError ? `Enriching books... (${completed}/${total}, ${title2} failed)` : `Enriching books... (${completed}/${total})`,
          processedCount: completed,
          currentItem: title2 || "Unknown title"
        });
      },
      10
      // maxConcurrent
    );
    const approvedCount = enrichedBooks.filter(
      (b) => b.confidence >= 0.6
    ).length;
    const reviewCount = enrichedBooks.filter((b) => b.confidence < 0.6).length;
    const resourceId = `job-results:${jobId}`;
    await env2.KV_CACHE.put(
      resourceId,
      JSON.stringify(enrichedBooks.map(mapToDetectedBook)),
      { expirationTtl: 3600 }
      // 1 hour
    );
    await doStub.updateProgress("ai_scan", {
      progress: 1,
      status: "Batch scan complete, finalizing results...",
      processedCount: uniqueBooks.length,
      currentItem: "Finalizing"
    });
    await doStub.complete("ai_scan", {
      summary: {
        totalProcessed: enrichedBooks.length,
        successCount: approvedCount,
        failureCount: reviewCount,
        duration: Date.now() - startTime,
        resourceId,
        totalDetected: enrichedBooks.length,
        approved: approvedCount,
        needsReview: reviewCount
      }
    });
  } catch (error3) {
    console.error("Batch processing error:", error3);
    await doStub.sendError("ai_scan", {
      code: "E_BATCH_SCAN_FAILED",
      message: error3.message,
      retryable: true,
      details: {
        fallbackAvailable: false
      }
    });
  }
}
__name(processBatchPhotos, "processBatchPhotos");
function deduplicateBooks(books) {
  const seen = /* @__PURE__ */ new Map();
  for (const book of books) {
    const key = book.isbn || `${book.title}::${book.author}`;
    if (!seen.has(key)) {
      seen.set(key, book);
    } else {
      const existing = seen.get(key);
      if ((book.confidence || 0) > (existing.confidence || 0)) {
        seen.set(key, book);
      }
    }
  }
  return Array.from(seen.values());
}
__name(deduplicateBooks, "deduplicateBooks");

// src/services/metrics-aggregator.js
async function aggregateMetrics(env2, period) {
  const periodMap = {
    "15m": "15 MINUTE",
    "1h": "1 HOUR",
    "24h": "24 HOUR",
    "7d": "7 DAY"
  };
  const interval = periodMap[period] || "1 HOUR";
  const result = {
    results: [],
    _note: "Analytics Engine queries not available in Workers runtime",
    _instructions: {
      method: "Cloudflare GraphQL API",
      endpoint: "https://api.cloudflare.com/client/v4/graphql",
      authentication: "Bearer token required",
      sampleQuery: `
query {
  viewer {
    accounts(filter: { accountTag: $accountId }) {
      analyticsEngineDatasets(filter: { name: "books_api_cache_metrics" }) {
        query(
          filter: { timestamp_geq: $startTime }
          orderBy: [timestamp_DESC]
        ) {
          index1
          double1
          count
        }
      }
    }
  }
}
      `.trim()
    }
  };
  let totalRequests = 0;
  let edgeHits = 0;
  let kvHits = 0;
  let r2Rehydrations = 0;
  let apiMisses = 0;
  const latencyData = {};
  for (const row of result.results || []) {
    const count3 = row.count || 0;
    totalRequests += count3;
    if (row.cache_source === "edge_hit") edgeHits = count3;
    else if (row.cache_source === "kv_hit") kvHits = count3;
    else if (row.cache_source === "r2_rehydrated") r2Rehydrations = count3;
    else if (row.cache_source === "api_miss") apiMisses = count3;
    latencyData[row.cache_source] = {
      avg: row.avg_latency || 0,
      p50: row.p50 || 0,
      p95: row.p95 || 0,
      p99: row.p99 || 0
    };
  }
  return {
    _limitation: "Analytics Engine queries not available from Workers runtime",
    _solution: "Use Cloudflare Dashboard or GraphQL API to query metrics",
    _graphql_endpoint: "https://api.cloudflare.com/client/v4/graphql",
    _dataset_name: "books_api_cache_metrics",
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    period,
    hitRates: {
      edge: totalRequests > 0 ? edgeHits / totalRequests * 100 : 0,
      kv: totalRequests > 0 ? kvHits / totalRequests * 100 : 0,
      r2_cold: totalRequests > 0 ? r2Rehydrations / totalRequests * 100 : 0,
      api: totalRequests > 0 ? apiMisses / totalRequests * 100 : 0,
      combined: totalRequests > 0 ? (edgeHits + kvHits) / totalRequests * 100 : 0
    },
    latency: latencyData,
    volume: {
      total_requests: totalRequests,
      edge_hits: edgeHits,
      kv_hits: kvHits,
      r2_rehydrations: r2Rehydrations,
      api_misses: apiMisses
    }
  };
}
__name(aggregateMetrics, "aggregateMetrics");

// src/handlers/metrics-handler.js
async function handleMetricsRequest(request, env2, ctx) {
  try {
    const url = new URL(request.url);
    const period = url.searchParams.get("period") || "1h";
    const format = url.searchParams.get("format") || "json";
    const cacheKey = `metrics:${period}`;
    const cached = await env2.CACHE.get(cacheKey);
    if (cached) {
      return new Response(cached, {
        headers: { "Content-Type": "application/json" }
      });
    }
    const metrics = await aggregateMetrics(env2, period);
    metrics.costs = estimateCosts(metrics.volume);
    metrics.health = assessHealth(metrics);
    const body = format === "prometheus" ? formatPrometheus(metrics) : JSON.stringify(metrics, null, 2);
    ctx.waitUntil(
      env2.CACHE.put(cacheKey, body, {
        expirationTtl: 300
      })
    );
    return new Response(body, {
      headers: {
        "Content-Type": format === "prometheus" ? "text/plain; version=0.0.4" : "application/json"
      }
    });
  } catch (error3) {
    return new Response(
      JSON.stringify({
        error: "Failed to fetch metrics",
        message: error3.message
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
}
__name(handleMetricsRequest, "handleMetricsRequest");
function estimateCosts(volume) {
  const kvReadCost = volume.kv_hits * 0.5 / 1e6;
  const r2ReadCost = volume.r2_rehydrations * 0.36 / 1e6;
  return {
    kv_reads_estimate: `$${kvReadCost.toFixed(4)}/period`,
    r2_reads: `$${r2ReadCost.toFixed(4)}/period`,
    total_estimate: `$${(kvReadCost + r2ReadCost).toFixed(4)}/period`
  };
}
__name(estimateCosts, "estimateCosts");
function assessHealth(metrics) {
  const issues = [];
  if (metrics.hitRates.combined < 90) {
    issues.push({
      severity: "warning",
      message: `Combined hit rate below target (${metrics.hitRates.combined.toFixed(1)}% vs 95% target)`,
      since: metrics.timestamp
    });
  }
  if (metrics.hitRates.edge < 75) {
    issues.push({
      severity: "warning",
      message: `Edge hit rate low (${metrics.hitRates.edge.toFixed(1)}% vs 80% target)`,
      since: metrics.timestamp
    });
  }
  return {
    status: issues.length === 0 ? "healthy" : "degraded",
    issues
  };
}
__name(assessHealth, "assessHealth");
function formatPrometheus(metrics) {
  return `
# HELP cache_hit_rate Cache hit rate by tier
# TYPE cache_hit_rate gauge
cache_hit_rate{tier="edge"} ${metrics.hitRates.edge}
cache_hit_rate{tier="kv"} ${metrics.hitRates.kv}
cache_hit_rate{tier="combined"} ${metrics.hitRates.combined}

# HELP cache_requests_total Total cache requests by tier
# TYPE cache_requests_total counter
cache_requests_total{tier="edge"} ${metrics.volume.edge_hits}
cache_requests_total{tier="kv"} ${metrics.volume.kv_hits}
cache_requests_total{tier="api_miss"} ${metrics.volume.api_misses}
  `.trim();
}
__name(formatPrometheus, "formatPrometheus");

// src/handlers/cache-metrics.js
async function handleCacheMetrics(request, env2) {
  try {
    const url = new URL(request.url);
    const period = url.searchParams.get("period") || "24h";
    const metrics = {
      period,
      message: "Analytics Engine queries must be performed via Cloudflare API or GraphQL",
      queryInstructions: {
        method: "GraphQL",
        endpoint: "https://api.cloudflare.com/client/v4/graphql",
        sampleQuery: `
query {
  viewer {
    accounts(filter: { accountTag: $accountId }) {
      analyticsEngineDatasets(filter: { name: "books_api_cache_metrics" }) {
        query(
          filter: { timestamp_geq: $startTime }
          orderBy: [timestamp_DESC]
        ) {
          index1
          count
        }
      }
    }
  }
}
        `,
        alternativeSQL: `
SELECT
  index1 as cache_tier,
  COUNT(*) as hits
FROM CACHE_ANALYTICS
WHERE timestamp > NOW() - INTERVAL '${period}'
GROUP BY index1
        `
      },
      realTimeMetrics: {
        note: "Real-time metrics are written but require external query",
        dataset: "books_api_cache_metrics",
        indices: [
          "edge_hit",
          "kv_hit",
          "cold_check",
          "r2_rehydrated",
          "api_miss"
        ]
      }
    };
    return new Response(JSON.stringify(metrics, null, 2), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (error3) {
    return new Response(
      JSON.stringify({
        error: "Failed to fetch metrics",
        message: error3.message
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
}
__name(handleCacheMetrics, "handleCacheMetrics");

// src/utils/transform-work.js
function transformWorkToGoogleFormat(work) {
  const primaryEdition = work.editions && work.editions.length > 0 ? work.editions[0] : null;
  const { authors, authorsDetailed } = extractAuthors(work, primaryEdition);
  const industryIdentifiers = buildIndustryIdentifiers(primaryEdition);
  const coverImageURL = primaryEdition?.coverImageURL || getPlaceholderCover();
  const volumeInfo = {
    title: work.title,
    subtitle: work.subtitle,
    authors,
    authorsDetailed: authorsDetailed.length > 0 ? authorsDetailed : void 0,
    publisher: primaryEdition?.publisher,
    publishedDate: work.firstPublicationYear ? work.firstPublicationYear.toString() : primaryEdition?.publicationDate,
    description: work.description || primaryEdition?.description,
    industryIdentifiers,
    pageCount: primaryEdition?.pageCount,
    categories: work.subjects || [],
    // CANONICAL: use work.subjects
    imageLinks: {
      thumbnail: coverImageURL,
      smallThumbnail: coverImageURL
    }
  };
  const volumeId = work.id || work.openLibraryWorkKey || `synthetic-${work.title.replace(/\s+/g, "-").toLowerCase()}`;
  const isbn = primaryEdition?.isbn13 || primaryEdition?.isbn10 || null;
  const searchLinks = generateSearchLinks(
    isbn,
    work.title,
    authors[0],
    // Primary author
    volumeId
  );
  return {
    kind: "books#volume",
    id: volumeId,
    volumeInfo,
    searchLinks
  };
}
__name(transformWorkToGoogleFormat, "transformWorkToGoogleFormat");
function extractAuthors(work, primaryEdition) {
  let authors = [];
  let authorsDetailed = [];
  if (work.authors) {
    if (Array.isArray(work.authors)) {
      authors = work.authors.map((a) => {
        if (typeof a === "string") return a;
        if (a && a.name) return a.name;
        return String(a);
      });
      authorsDetailed = work.authors.filter((a) => typeof a === "object" && a !== null).map((a) => buildAuthorDetails(a));
    } else if (typeof work.authors === "string") {
      authors = [work.authors];
      authorsDetailed = [{ name: work.authors, gender: "Unknown" }];
    }
  }
  if (authors.length === 0 && primaryEdition?.authors) {
    authors = Array.isArray(primaryEdition.authors) ? primaryEdition.authors.map(
      (a) => typeof a === "string" ? a : a.name || String(a)
    ) : [String(primaryEdition.authors)];
    if (Array.isArray(primaryEdition.authors)) {
      authorsDetailed = primaryEdition.authors.filter((a) => typeof a === "object" && a !== null).map((a) => buildAuthorDetails(a));
    }
  }
  return { authors, authorsDetailed };
}
__name(extractAuthors, "extractAuthors");
function buildAuthorDetails(author) {
  return {
    name: author.name,
    gender: author.gender || "Unknown",
    ...author.culturalRegion && { culturalRegion: author.culturalRegion },
    ...author.nationality && { nationality: author.nationality },
    ...author.birthYear && { birthYear: author.birthYear },
    ...author.deathYear && { deathYear: author.deathYear },
    ...author.openLibraryID && { openLibraryID: author.openLibraryID },
    ...author.isbndbID && { isbndbID: author.isbndbID },
    ...author.googleBooksID && { googleBooksID: author.googleBooksID },
    ...author.goodreadsID && { goodreadsID: author.goodreadsID },
    ...author.bookCount && { bookCount: author.bookCount }
  };
}
__name(buildAuthorDetails, "buildAuthorDetails");
function buildIndustryIdentifiers(primaryEdition) {
  const identifiers = [];
  if (primaryEdition?.isbn13) {
    identifiers.push({
      type: "ISBN_13",
      identifier: primaryEdition.isbn13
    });
  }
  if (primaryEdition?.isbn10) {
    identifiers.push({
      type: "ISBN_10",
      identifier: primaryEdition.isbn10
    });
  }
  return identifiers;
}
__name(buildIndustryIdentifiers, "buildIndustryIdentifiers");

// src/handlers/book-search.js
async function searchByTitle(title2, options, env2, ctx) {
  const { maxResults = 20 } = options;
  const cacheKey = CacheKeyFactory.bookTitle(title2, maxResults);
  const cache = new UnifiedCacheService(env2, ctx);
  const cachedResult = await cache.get(cacheKey, "title", {
    query: title2,
    maxResults
  });
  if (cachedResult && cachedResult.data) {
    const { data, source } = cachedResult;
    const headers = await generateCacheHeaders(
      true,
      cachedResult.age || 0,
      cachedResult.ttl || 0,
      data.items,
      env2
    );
    ctx.waitUntil(
      writeCacheMetrics(env2, {
        endpoint: "/search/title",
        cacheHit: true,
        responseTime: 0,
        // Cache hits are instant
        imageQuality: headers["X-Image-Quality"],
        dataCompleteness: parseInt(headers["X-Data-Completeness"]),
        itemCount: data.items?.length || 0
      })
    );
    return {
      ...data,
      cached: true,
      cacheSource: source,
      // NEW: Include cache source (EDGE or KV)
      _cacheHeaders: headers
    };
  }
  const startTime = Date.now();
  try {
    const searchPromises = [
      searchGoogleBooks(title2, { maxResults }, env2),
      searchOpenLibrary(title2, { maxResults }, env2)
    ];
    const results = await Promise.allSettled(searchPromises);
    let finalItems = [];
    let successfulProviders = [];
    if (results[0].status === "fulfilled" && results[0].value) {
      const googleData = results[0].value;
      if (googleData.works && googleData.works.length > 0) {
        const transformedItems = googleData.works.map(
          (work) => transformWorkToGoogleFormat(work)
        );
        finalItems = [...finalItems, ...transformedItems];
        successfulProviders.push("google");
      }
    }
    if (results[1].status === "fulfilled" && results[1].value) {
      const olData = results[1].value;
      if (olData.works && olData.works.length > 0) {
        const transformedItems = olData.works.map(
          (work) => transformWorkToGoogleFormat(work)
        );
        finalItems = [...finalItems, ...transformedItems];
        successfulProviders.push("openlibrary");
      }
    }
    const dedupedItems = deduplicateByISBN(finalItems);
    const responseData = {
      kind: "books#volumes",
      totalItems: dedupedItems.length,
      items: dedupedItems.slice(0, maxResults),
      provider: `orchestrated:${successfulProviders.join("+")}`,
      cached: false,
      responseTime: Date.now() - startTime,
      _cacheHeaders: await generateCacheHeaders(
        false,
        0,
        6 * 60 * 60,
        dedupedItems,
        env2
      )
      // TTL: 6h
    };
    const ttl = 6 * 60 * 60;
    const hotTtl = 2 * 60 * 60;
    ctx.waitUntil(setCached(cacheKey, responseData, ttl, env2, ctx, hotTtl));
    ctx.waitUntil(
      writeCacheMetrics(env2, {
        endpoint: "/search/title",
        cacheHit: false,
        responseTime: Date.now() - startTime,
        imageQuality: responseData._cacheHeaders["X-Image-Quality"],
        dataCompleteness: parseInt(
          responseData._cacheHeaders["X-Data-Completeness"]
        ),
        itemCount: dedupedItems.length
      })
    );
    return responseData;
  } catch (error3) {
    console.error(`Title search failed for "${title2}":`, error3);
    return {
      error: "Title search failed",
      details: error3.message,
      items: [],
      _cacheHeaders: generateCacheHeaders(false, 0, 0, [])
    };
  }
}
__name(searchByTitle, "searchByTitle");
async function searchByISBN2(isbn, options, env2, ctx) {
  const { maxResults = 1 } = options;
  const cacheKey = CacheKeyFactory.bookISBN(isbn);
  const cache = new UnifiedCacheService(env2, ctx);
  const cachedResult = await cache.get(cacheKey, "isbn", {
    query: isbn,
    maxResults
  });
  if (cachedResult && cachedResult.data) {
    const { data, source } = cachedResult;
    const headers = await generateCacheHeaders(
      true,
      cachedResult.age || 0,
      cachedResult.ttl || 0,
      data.items,
      env2
    );
    ctx.waitUntil(
      writeCacheMetrics(env2, {
        endpoint: "/search/isbn",
        isbn,
        // Log actual ISBN for daily harvest
        cacheHit: true,
        responseTime: 0,
        // Cache hits are instant
        imageQuality: headers["X-Image-Quality"],
        dataCompleteness: parseInt(headers["X-Data-Completeness"]),
        itemCount: data.items?.length || 0
      })
    );
    return {
      ...data,
      cached: true,
      cacheSource: source,
      // NEW: Include cache source (EDGE or KV)
      _cacheHeaders: headers
    };
  }
  const startTime = Date.now();
  try {
    const searchPromises = [
      searchGoogleBooksByISBN(isbn, env2),
      searchOpenLibrary(isbn, { maxResults, isbn }, env2)
    ];
    const results = await Promise.allSettled(searchPromises);
    let finalItems = [];
    let successfulProviders = [];
    if (results[0].status === "fulfilled" && results[0].value) {
      const googleData = results[0].value;
      if (googleData.works && googleData.works.length > 0) {
        const transformedItems = googleData.works.map(
          (work) => transformWorkToGoogleFormat(work)
        );
        finalItems = [...finalItems, ...transformedItems];
        successfulProviders.push("google");
      }
    }
    if (results[1].status === "fulfilled" && results[1].value) {
      const olData = results[1].value;
      if (olData.works && olData.works.length > 0) {
        const transformedItems = olData.works.map(
          (work) => transformWorkToGoogleFormat(work)
        );
        finalItems = [...finalItems, ...transformedItems];
        successfulProviders.push("openlibrary");
      }
    }
    const dedupedItems = deduplicateByISBN(finalItems);
    const responseData = {
      kind: "books#volumes",
      totalItems: dedupedItems.length,
      items: dedupedItems.slice(0, maxResults),
      provider: `orchestrated:${successfulProviders.join("+")}`,
      cached: false,
      responseTime: Date.now() - startTime,
      _cacheHeaders: generateCacheHeaders(
        false,
        0,
        7 * 24 * 60 * 60,
        dedupedItems
      )
      // TTL: 7d
    };
    const ttl = 7 * 24 * 60 * 60;
    const hotTtl = 2 * 24 * 60 * 60;
    ctx.waitUntil(setCached(cacheKey, responseData, ttl, env2, ctx, hotTtl));
    ctx.waitUntil(
      writeCacheMetrics(env2, {
        endpoint: "/search/isbn",
        isbn,
        // Log actual ISBN for daily harvest
        cacheHit: false,
        responseTime: Date.now() - startTime,
        imageQuality: responseData._cacheHeaders["X-Image-Quality"],
        dataCompleteness: parseInt(
          responseData._cacheHeaders["X-Data-Completeness"]
        ),
        itemCount: dedupedItems.length
      })
    );
    return responseData;
  } catch (error3) {
    console.error(`ISBN search failed for "${isbn}":`, error3);
    return {
      error: "ISBN search failed",
      details: error3.message,
      items: [],
      _cacheHeaders: generateCacheHeaders(false, 0, 0, [])
    };
  }
}
__name(searchByISBN2, "searchByISBN");
function deduplicateByISBN(items) {
  const seen = /* @__PURE__ */ new Set();
  const seenTitles = /* @__PURE__ */ new Set();
  return items.filter((item) => {
    const identifiers = item.volumeInfo?.industryIdentifiers || [];
    const isbns = identifiers.filter((id) => id.type === "ISBN_13" || id.type === "ISBN_10").map((id) => id.identifier);
    if (isbns && isbns.length > 0) {
      const hasNewISBN = isbns.some((isbn) => {
        const normalized = isbn.replace(/[-\s]/g, "");
        if (seen.has(normalized)) return false;
        seen.add(normalized);
        return true;
      });
      return hasNewISBN;
    }
    if (item.volumeInfo?.title) {
      const normalizedTitle = item.volumeInfo.title.toLowerCase().replace(/[^\w\s]/g, "").trim();
      if (seenTitles.has(normalizedTitle)) {
        return false;
      }
      seenTitles.add(normalizedTitle);
      return true;
    }
    return true;
  });
}
__name(deduplicateByISBN, "deduplicateByISBN");
async function generateCacheHeaders(cacheHit, age, ttl, items = [], env2) {
  const headers = {};
  headers["X-Cache-Status"] = cacheHit ? "HIT" : "MISS";
  headers["X-Cache-Age"] = age.toString();
  headers["X-Cache-TTL"] = ttl.toString();
  const imageQuality = await analyzeImageQuality(items, env2);
  headers["X-Image-Quality"] = imageQuality;
  const completeness = calculateDataCompleteness(items);
  headers["X-Data-Completeness"] = completeness.toString();
  return headers;
}
__name(generateCacheHeaders, "generateCacheHeaders");
async function analyzeImageQuality(items, env2) {
  if (!items || items.length === 0) return "missing";
  const coverUrls = items.map((item) => {
    const imageLinks = item.volumeInfo?.imageLinks;
    return imageLinks?.thumbnail || imageLinks?.smallThumbnail || "";
  });
  const qualityResults = await Promise.all(
    coverUrls.map((url) => detectImageQuality(url, env2))
  );
  let highCount = 0;
  let mediumCount = 0;
  let lowCount = 0;
  let missingCount = 0;
  for (const result of qualityResults) {
    switch (result.quality) {
      case "high":
        highCount++;
        break;
      case "medium":
        mediumCount++;
        break;
      case "low":
        lowCount++;
        break;
      case "missing":
        missingCount++;
        break;
    }
  }
  const total = items.length;
  if (highCount / total > 0.5) return "high";
  if (mediumCount / total > 0.3) return "medium";
  if (missingCount / total > 0.5) return "missing";
  return "low";
}
__name(analyzeImageQuality, "analyzeImageQuality");
function calculateDataCompleteness(items) {
  if (!items || items.length === 0) return 0;
  let completeCount = 0;
  for (const item of items) {
    const volumeInfo = item.volumeInfo;
    const hasISBN = volumeInfo?.industryIdentifiers?.length > 0;
    const hasCover = volumeInfo?.imageLinks?.thumbnail || volumeInfo?.imageLinks?.smallThumbnail;
    if (hasISBN && hasCover) {
      completeCount++;
    }
  }
  return Math.round(completeCount / items.length * 100);
}
__name(calculateDataCompleteness, "calculateDataCompleteness");

// src/handlers/author-search.js
async function searchByAuthor(authorName, options, env2, ctx) {
  const { limit = 50, offset = 0, sortBy = "publicationYear" } = options;
  const validatedLimit = Math.min(Math.max(1, limit), 100);
  const validatedOffset = Math.max(0, offset);
  const cacheKey = CacheKeyFactory.authorSearch({
    query: authorName,
    maxResults: validatedLimit,
    showAllEditions: false,
    // Assuming default, adjust if needed
    sortBy
  });
  const cache = new UnifiedCacheService(env2, ctx);
  const cachedResult = await cache.get(cacheKey, "author", {
    query: authorName,
    limit: validatedLimit,
    offset: validatedOffset
  });
  if (cachedResult && cachedResult.data) {
    const { data, source } = cachedResult;
    ctx.waitUntil(
      writeCacheMetrics2(env2, {
        endpoint: "/search/author",
        cacheHit: true,
        responseTime: 0,
        itemCount: data.works?.length || 0,
        authorName
      })
    );
    return {
      ...data,
      cached: true,
      cacheSource: source
    };
  }
  const startTime = Date.now();
  try {
    const olResult = await getOpenLibraryAuthorWorks(
      authorName,
      env2
    );
    if (!olResult) {
      return {
        success: false,
        error: "Author not found in OpenLibrary",
        works: [],
        pagination: null
      };
    }
    const allWorks = olResult.works || [];
    const totalWorks = allWorks.length;
    const sortedWorks = applySorting(allWorks, sortBy);
    const paginatedWorks = sortedWorks.slice(
      validatedOffset,
      validatedOffset + validatedLimit
    );
    const responseData = {
      success: true,
      provider: "openlibrary",
      author: {
        name: authorName,
        openLibraryKey: olResult.author?.openLibraryKey || null,
        totalWorks
      },
      works: paginatedWorks,
      pagination: {
        total: totalWorks,
        limit: validatedLimit,
        offset: validatedOffset,
        hasMore: validatedOffset + validatedLimit < totalWorks,
        nextOffset: validatedOffset + validatedLimit < totalWorks ? validatedOffset + validatedLimit : null
      },
      cached: false,
      responseTime: Date.now() - startTime
    };
    const ttl = 6 * 60 * 60;
    ctx.waitUntil(setCached(cacheKey, responseData, ttl, env2));
    ctx.waitUntil(
      writeCacheMetrics2(env2, {
        endpoint: "/search/author",
        cacheHit: false,
        responseTime: Date.now() - startTime,
        itemCount: paginatedWorks.length,
        authorName
      })
    );
    return responseData;
  } catch (error3) {
    console.error(`Author search failed for "${authorName}":`, error3);
    return {
      success: false,
      error: "Author search failed",
      details: error3.message,
      works: [],
      pagination: null
    };
  }
}
__name(searchByAuthor, "searchByAuthor");
function applySorting(works, sortBy) {
  const sortedWorks = [...works];
  switch (sortBy) {
    case "publicationYear":
      return sortedWorks.sort(
        (a, b) => (b.firstPublicationYear || 0) - (a.firstPublicationYear || 0)
      );
    case "publicationYearAsc":
      return sortedWorks.sort(
        (a, b) => (a.firstPublicationYear || 0) - (b.firstPublicationYear || 0)
      );
    case "title":
      return sortedWorks.sort(
        (a, b) => (a.title || "").localeCompare(b.title || "")
      );
    case "popularity":
      return sortedWorks.sort(
        (a, b) => (b.editions?.length || 0) - (a.editions?.length || 0)
      );
    default:
      return sortedWorks;
  }
}
__name(applySorting, "applySorting");
async function writeCacheMetrics2(env2, metrics) {
  if (!env2.CACHE_ANALYTICS) {
    console.warn("CACHE_ANALYTICS binding not available");
    return;
  }
  try {
    await env2.CACHE_ANALYTICS.writeDataPoint({
      blobs: [
        metrics.endpoint,
        metrics.authorName,
        metrics.cacheHit ? "HIT" : "MISS"
      ],
      doubles: [metrics.responseTime, metrics.itemCount],
      indexes: [metrics.cacheHit ? "HIT" : "MISS"]
    });
  } catch (error3) {
    console.error("Failed to write cache metrics:", error3);
  }
}
__name(writeCacheMetrics2, "writeCacheMetrics");

// src/utils/durable-object-helpers.ts
function getProgressDOStub(jobId, env2) {
  const id = env2.PROGRESS_WEBSOCKET_DO.idFromName(jobId);
  return env2.PROGRESS_WEBSOCKET_DO.get(id);
}
__name(getProgressDOStub, "getProgressDOStub");

// src/middleware/hono-analytics.ts
var analyticsMiddleware = /* @__PURE__ */ __name(() => {
  return async (c, next) => {
    const startTime = Date.now();
    await next();
    c.res.headers.set("X-Router", "hono");
    const responseTime = Date.now() - startTime;
    c.res.headers.set("X-Response-Time", `${responseTime}ms`);
    if (c.env.ENABLE_PERFORMANCE_LOGGING === "true" && Math.random() < 0.1) {
      c.executionCtx.waitUntil(
        c.env.PERFORMANCE_ANALYTICS?.writeDataPoint({
          blobs: [
            "hono_router",
            c.req.method,
            c.req.path,
            c.res.status.toString(),
            `${responseTime}ms`
          ],
          doubles: [responseTime],
          indexes: [(/* @__PURE__ */ new Date()).toISOString()]
        }).catch((err) => {
          console.error("[Hono Analytics] Failed to log performance:", err);
        })
      );
    }
  };
}, "analyticsMiddleware");

// src/middleware/rate-limiter.js
var RATE_LIMITS = {
  default: 100,
  // Generic search endpoints (v1/search/*)
  batchEnrichment: 10,
  // /v1/enrichment/batch
  aiScan: 5,
  // /api/batch-scan (AI photo scanning)
  csvImport: 5,
  // /api/import/csv-gemini (AI parsing)
  bookshelfScan: 5
  // /api/scan-bookshelf/batch (AI scanning)
};
function getRateLimitForEndpoint(pathname) {
  if (pathname === "/api/batch-scan") return RATE_LIMITS.aiScan;
  if (pathname === "/api/import/csv-gemini") return RATE_LIMITS.csvImport;
  if (pathname === "/api/scan-bookshelf/batch")
    return RATE_LIMITS.bookshelfScan;
  if (pathname === "/v1/enrichment/batch") return RATE_LIMITS.batchEnrichment;
  if (pathname.startsWith("/v1/search/")) return RATE_LIMITS.default;
  return RATE_LIMITS.default;
}
__name(getRateLimitForEndpoint, "getRateLimitForEndpoint");
async function checkRateLimit(request, env2, maxRequests = null) {
  const clientIP = request.headers.get("CF-Connecting-IP") || "unknown";
  const pathname = new URL(request.url).pathname;
  const limitForEndpoint = maxRequests !== null ? maxRequests : getRateLimitForEndpoint(pathname);
  try {
    const rateLimiterId = env2.RATE_LIMITER_DO.idFromName(clientIP);
    const rateLimiterStub = env2.RATE_LIMITER_DO.get(rateLimiterId);
    const response = await rateLimiterStub.fetch(
      new Request("http://localhost/check", {
        method: "POST",
        headers: {
          "X-Rate-Limit-Max": limitForEndpoint.toString()
        }
      })
    );
    const { allowed, remaining, resetAt } = await response.json();
    if (!allowed) {
      const retryAfterSeconds = Math.ceil((resetAt - Date.now()) / 1e3);
      const retryAfter = Math.max(1, retryAfterSeconds);
      console.warn(
        `[Rate Limit] Blocked request from IP: ${clientIP} (limit exceeded, endpoint: ${pathname}, limit: ${limitForEndpoint})`
      );
      return new Response(
        JSON.stringify({
          error: `Rate limit exceeded. Please try again in ${retryAfter} seconds.`,
          code: "RATE_LIMIT_EXCEEDED",
          details: {
            retryAfter,
            clientIP: clientIP.substring(0, 8) + "...",
            // Partial IP for privacy
            requestsRemaining: remaining,
            requestsLimit: limitForEndpoint,
            endpoint: pathname
          }
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": retryAfter.toString(),
            "X-RateLimit-Limit": limitForEndpoint.toString(),
            "X-RateLimit-Remaining": remaining.toString(),
            "X-RateLimit-Reset": resetAt.toString()
          }
        }
      );
    }
    return null;
  } catch (error3) {
    console.error("[Rate Limit] Error checking rate limit:", error3);
    console.warn("[Rate Limit] Failing open - allowing request despite error");
    return null;
  }
}
__name(checkRateLimit, "checkRateLimit");

// src/router.ts
var app = new Hono2();
app.use("*", analyticsMiddleware());
app.use(
  "*",
  cors({
    origin: /* @__PURE__ */ __name((origin) => {
      const allowedOrigins = [
        "https://bookstrack.oooefam.net",
        // Production web app
        "https://harvest.oooefam.net",
        // Harvest dashboard
        "capacitor://localhost",
        // iOS app (Capacitor)
        "http://localhost:3000",
        // Local dev (web)
        "http://localhost:8787"
        // Local dev (wrangler)
      ];
      return origin ? allowedOrigins.includes(origin) : true;
    }, "origin"),
    allowMethods: ["GET", "POST", "OPTIONS", "PUT", "DELETE"],
    allowHeaders: ["Content-Type", "Authorization"],
    exposeHeaders: ["X-Router", "X-Response-Time"],
    maxAge: 86400
    // 24 hours
  })
);
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    worker: "api-worker",
    version: "2.1.0",
    router: "hono",
    // Key field for A/B testing
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
});
app.get("/v1/search/isbn", async (c) => {
  const isbn = c.req.query("isbn");
  const isbnRegex = /^(?=(?:\D*\d){10}(?:(?:\D*\d){3})?$)[\d-]+$/;
  if (!isbn || !isbnRegex.test(isbn)) {
    return c.json(
      {
        error: {
          code: "INVALID_ISBN",
          message: "A valid ISBN-10 or ISBN-13 is required"
        }
      },
      400
    );
  }
  return await handleSearchISBN(isbn, c.env, c.req.raw);
});
app.get("/v1/search/title", async (c) => {
  const rawQuery = c.req.query("q");
  const query = rawQuery?.substring(0, 200);
  if (!query || query.trim().length === 0) {
    return c.json(
      {
        error: {
          code: "MISSING_PARAM",
          message: 'Query parameter "q" is required (max 200 characters)'
        }
      },
      400
    );
  }
  return await handleSearchTitle(query, c.env, c.req.raw);
});
app.get("/v1/search/advanced", async (c) => {
  const title2 = c.req.query("title")?.substring(0, 200) || "";
  const author = c.req.query("author")?.substring(0, 200) || "";
  if (!title2 && !author) {
    return c.json(
      {
        error: {
          code: "MISSING_PARAM",
          message: "At least one search parameter required (title or author, max 200 characters each)"
        }
      },
      400
    );
  }
  return await handleSearchAdvanced(
    title2,
    author,
    c.env,
    c.executionCtx,
    c.req.raw
  );
});
app.get("/search/title", async (c) => {
  const query = c.req.query("q");
  if (!query) {
    return c.json(
      {
        error: {
          code: "MISSING_PARAM",
          message: 'Missing query parameter "q"'
        }
      },
      400
    );
  }
  const maxResults = parseInt(c.req.query("maxResults") || "20");
  const result = await searchByTitle(
    query,
    { maxResults },
    c.env,
    c.executionCtx
  );
  const cacheHeaders = result._cacheHeaders || {};
  delete result._cacheHeaders;
  const response = c.json(result, 200);
  Object.entries(cacheHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  response.headers.set("Deprecation", "true");
  response.headers.set("Sunset", "Sat, 1 Mar 2026 00:00:00 GMT");
  response.headers.set(
    "Warning",
    '299 - "This endpoint is deprecated. Use /v1/search/title instead. Sunset: March 1, 2026"'
  );
  response.headers.set(
    "Link",
    '<https://api.oooefam.net/v1/search/title>; rel="alternate"; title="Use /v1/search/title instead"'
  );
  return response;
});
app.get("/search/isbn", async (c) => {
  const isbn = c.req.query("isbn");
  if (!isbn) {
    return c.json(
      {
        error: {
          code: "MISSING_PARAM",
          message: "Missing ISBN parameter"
        }
      },
      400
    );
  }
  const maxResults = parseInt(c.req.query("maxResults") || "1");
  const result = await searchByISBN2(
    isbn,
    { maxResults },
    c.env,
    c.executionCtx
  );
  const cacheHeaders = result._cacheHeaders || {};
  delete result._cacheHeaders;
  const response = c.json(result, 200);
  Object.entries(cacheHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  response.headers.set("Deprecation", "true");
  response.headers.set("Sunset", "Sat, 1 Mar 2026 00:00:00 GMT");
  response.headers.set(
    "Warning",
    '299 - "This endpoint is deprecated. Use /v1/search/isbn instead. Sunset: March 1, 2026"'
  );
  response.headers.set(
    "Link",
    '<https://api.oooefam.net/v1/search/isbn>; rel="alternate"; title="Use /v1/search/isbn instead"'
  );
  return response;
});
app.get("/search/author", async (c) => {
  const authorName = c.req.query("q");
  if (!authorName) {
    return c.json(
      {
        error: {
          code: "MISSING_PARAM",
          message: 'Missing query parameter "q"'
        }
      },
      400
    );
  }
  const limitParam = c.req.query("limit") || c.req.query("maxResults") || "50";
  const limit = parseInt(limitParam);
  const offset = parseInt(c.req.query("offset") || "0");
  const sortBy = c.req.query("sortBy") || "publicationYear";
  if (limit < 1 || limit > 100) {
    return c.json(
      {
        error: {
          code: "INVALID_PARAM",
          message: "Limit must be between 1 and 100"
        }
      },
      400
    );
  }
  if (offset < 0) {
    return c.json(
      {
        error: {
          code: "INVALID_PARAM",
          message: "Offset must be >= 0"
        }
      },
      400
    );
  }
  const validSortOptions = [
    "publicationYear",
    "publicationYearAsc",
    "title",
    "popularity"
  ];
  if (!validSortOptions.includes(sortBy)) {
    return c.json(
      {
        error: {
          code: "INVALID_PARAM",
          message: `sortBy must be one of: ${validSortOptions.join(", ")}`
        }
      },
      400
    );
  }
  const result = await searchByAuthor(
    authorName,
    { limit, offset, sortBy },
    c.env,
    c.executionCtx
  );
  const cacheStatus = result.cached ? "HIT" : "MISS";
  const cacheSource = result.cacheSource || "NONE";
  const response = c.json(result, 200);
  response.headers.set("Cache-Control", "public, max-age=21600");
  response.headers.set("X-Cache", cacheStatus);
  response.headers.set("X-Cache-Source", cacheSource);
  response.headers.set("X-Provider", result.provider || "openlibrary");
  response.headers.set("Deprecation", "true");
  response.headers.set("Sunset", "Sat, 1 Mar 2026 00:00:00 GMT");
  response.headers.set(
    "Warning",
    '299 - "This endpoint is deprecated. Use /v1/search/advanced instead. Sunset: March 1, 2026"'
  );
  response.headers.set(
    "Link",
    '<https://api.oooefam.net/v1/search/advanced>; rel="alternate"; title="Use /v1/search/advanced instead"'
  );
  return response;
});
app.get("/search/advanced", async (c) => {
  const bookTitle = c.req.query("title") || c.req.query("bookTitle");
  const authorName = c.req.query("author") || c.req.query("authorName");
  if (!bookTitle && !authorName) {
    return c.json(
      {
        error: {
          code: "MISSING_PARAM",
          message: "At least one search parameter required (title or author)"
        }
      },
      400
    );
  }
  const response = await handleSearchAdvanced(
    bookTitle || "",
    authorName || "",
    c.env,
    c.executionCtx,
    c.req.raw
  );
  response.headers.set("Cache-Control", "public, max-age=21600");
  response.headers.set("Deprecation", "true");
  response.headers.set("Sunset", "Sat, 1 Mar 2026 00:00:00 GMT");
  response.headers.set(
    "Warning",
    '299 - "This endpoint is deprecated. Use /v1/search/advanced instead. Sunset: March 1, 2026"'
  );
  response.headers.set(
    "Link",
    '<https://api.oooefam.net/v1/search/advanced>; rel="alternate"; title="Use /v1/search/advanced instead"'
  );
  return response;
});
app.post("/search/advanced", async (c) => {
  try {
    const searchParams = await c.req.json();
    const bookTitle = searchParams.title || searchParams.bookTitle;
    const authorName = searchParams.author || searchParams.authorName;
    if (!bookTitle && !authorName) {
      return c.json(
        {
          error: {
            code: "MISSING_PARAM",
            message: "At least one search parameter required (title or author)"
          }
        },
        400
      );
    }
    const response = await handleSearchAdvanced(
      bookTitle || "",
      authorName || "",
      c.env,
      c.executionCtx,
      c.req.raw
    );
    response.headers.set("Deprecation", "true");
    response.headers.set("Sunset", "Sat, 1 Mar 2026 00:00:00 GMT");
    response.headers.set(
      "Warning",
      '299 - "This endpoint is deprecated. Use /v1/search/advanced instead. Sunset: March 1, 2026"'
    );
    response.headers.set(
      "Link",
      '<https://api.oooefam.net/v1/search/advanced>; rel="alternate"; title="Use /v1/search/advanced instead"'
    );
    return response;
  } catch (error3) {
    console.error("Advanced search failed:", error3);
    return c.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: `Advanced search failed: ${error3.message}`
        }
      },
      500
    );
  }
});
var rateLimitMiddleware = /* @__PURE__ */ __name(async (c, next) => {
  const rateLimitResponse = await checkRateLimit(c.req.raw, c.env);
  if (rateLimitResponse) return rateLimitResponse;
  await next();
}, "rateLimitMiddleware");
app.post("/v1/enrichment/batch", rateLimitMiddleware, async (c) => {
  return await handleBatchEnrichment(c.req.raw, c.env, c.executionCtx);
});
app.post("/api/scan-bookshelf/batch", rateLimitMiddleware, async (c) => {
  return await handleBatchScan(c.req.raw, c.env, c.executionCtx);
});
app.post("/api/import/csv-gemini", rateLimitMiddleware, async (c) => {
  return await handleCSVImport(c.req.raw, c.env, c.executionCtx);
});
app.get("/metrics", async (c) => {
  return await handleMetricsRequest(c.req.raw, c.env, c.executionCtx);
});
app.get("/api/cache/metrics", async (c) => {
  return await handleCacheMetrics(c.req.raw, c.env);
});
app.get("/api/cache/stats", async (c) => {
  try {
    const id = c.env.CACHE_METRICS_DO.idFromName("cache-metrics-singleton");
    const stub = c.env.CACHE_METRICS_DO.get(id);
    const response = await stub.fetch("http://do/stats", { method: "GET" });
    if (!response.ok) {
      console.error(
        "Failed to fetch cache stats from DO:",
        response.status,
        response.statusText
      );
      return c.json(
        {
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to retrieve cache statistics"
          }
        },
        500
      );
    }
    const stats = await response.json();
    return c.json(stats);
  } catch (error3) {
    console.error("Error fetching cache stats:", error3);
    return c.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Internal server error while fetching cache statistics"
        }
      },
      500
    );
  }
});
app.get("/ws/progress", async (c) => {
  const jobId = c.req.query("jobId")?.substring(0, 100);
  if (!jobId || jobId.trim().length === 0) {
    return c.json(
      {
        error: {
          code: "MISSING_PARAM",
          message: "Missing jobId parameter"
        }
      },
      400
    );
  }
  const doStub = getProgressDOStub(jobId, c.env);
  return doStub.fetch(c.req.raw);
});
app.get("/v1/scan/results/:jobId", async (c) => {
  const jobId = c.req.param("jobId")?.substring(0, 100);
  if (!jobId || jobId.trim().length === 0) {
    return c.json(
      {
        data: null,
        metadata: {
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        },
        error: {
          code: "MISSING_PARAM",
          message: "Missing jobId parameter"
        }
      },
      400
    );
  }
  const resultsKey = `scan-results:${jobId}`;
  const results = await c.env.KV_CACHE.get(resultsKey, "json");
  if (!results) {
    return c.json(
      {
        data: null,
        metadata: {
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        },
        error: {
          message: "Scan results not found or expired. Results are stored for 24 hours after job completion.",
          code: "NOT_FOUND",
          details: {
            jobId,
            resultsKey,
            ttl: "24 hours"
          }
        }
      },
      404
    );
  }
  return c.json({
    data: results,
    metadata: {
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      cached: true,
      provider: "kv_cache"
    }
  });
});
app.get("/v1/csv/results/:jobId", async (c) => {
  const jobId = c.req.param("jobId")?.substring(0, 100);
  if (!jobId || jobId.trim().length === 0) {
    return c.json(
      {
        data: null,
        metadata: {
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        },
        error: {
          code: "MISSING_PARAM",
          message: "Missing jobId parameter"
        }
      },
      400
    );
  }
  const resultsKey = `csv-results:${jobId}`;
  const results = await c.env.KV_CACHE.get(resultsKey, "json");
  if (!results) {
    return c.json(
      {
        data: null,
        metadata: {
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        },
        error: {
          message: "CSV import results not found or expired. Results are stored for 24 hours after job completion.",
          code: "NOT_FOUND",
          details: {
            jobId,
            resultsKey,
            ttl: "24 hours"
          }
        }
      },
      404
    );
  }
  return c.json({
    data: results,
    metadata: {
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      cached: true,
      provider: "kv_cache"
    }
  });
});
app.post("/api/batch-scan", rateLimitMiddleware, async (c) => {
  return await handleBatchScan(c.req.raw, c.env, c.executionCtx);
});
app.get("/test/error", (c) => {
  if (c.env.LOG_LEVEL !== "DEBUG") {
    return c.json(
      {
        error: {
          code: "NOT_FOUND",
          message: "Endpoint not found: GET /test/error"
        }
      },
      404
    );
  }
  throw new Error("Test error for onError handler validation");
});
app.post("/test/cache-event", async (c) => {
  if (c.env.LOG_LEVEL !== "DEBUG") {
    return c.json(
      {
        error: {
          code: "NOT_FOUND",
          message: "Endpoint not found: POST /test/cache-event"
        }
      },
      404
    );
  }
  try {
    const id = c.env.CACHE_METRICS_DO.idFromName("cache-metrics-singleton");
    const stub = c.env.CACHE_METRICS_DO.get(id);
    const timestamp = Date.now();
    await stub.fetch("http://do/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "hit",
        prefix: "edge",
        key: "test:edge:hit",
        timestamp
      })
    });
    await stub.fetch("http://do/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "miss",
        prefix: "book",
        key: "book:isbn:test123",
        timestamp
      })
    });
    await stub.fetch("http://do/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "write",
        prefix: "author",
        key: "author:search:testauthor",
        timestamp
      })
    });
    const statsResponse = await stub.fetch("http://do/stats", {
      method: "GET"
    });
    const stats = await statsResponse.json();
    return c.json({
      success: true,
      message: "Sent 3 synthetic cache events",
      events: [
        { type: "hit", prefix: "edge" },
        { type: "miss", prefix: "book" },
        { type: "write", prefix: "author" }
      ],
      currentStats: stats
    });
  } catch (error3) {
    console.error("Failed to send test cache events:", error3);
    return c.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to send test cache events",
          details: error3.message
        }
      },
      500
    );
  }
});
app.notFound((c) => {
  return c.json(
    {
      error: {
        code: "NOT_FOUND",
        message: `Endpoint not found: ${c.req.method} ${c.req.path}`
      }
    },
    404
  );
});
app.onError((err, c) => {
  console.error("[Hono] Unhandled error:", err);
  if (c.env.PERFORMANCE_ANALYTICS && typeof c.env.PERFORMANCE_ANALYTICS.writeDataPoint === "function") {
    try {
      const dataPointPromise = Promise.resolve(
        c.env.PERFORMANCE_ANALYTICS.writeDataPoint({
          blobs: ["router_error", err.message, c.req.path, c.req.method],
          doubles: [1],
          // Error count
          indexes: ["hono"]
          // Router type
        })
      );
      c.executionCtx.waitUntil(
        dataPointPromise.catch((analyticsErr) => {
          console.error(
            "[Hono] Failed to log error to Analytics Engine:",
            analyticsErr
          );
        })
      );
    } catch (syncError) {
      console.error(
        "[Hono] Synchronous error when attempting to log to Analytics Engine:",
        syncError
      );
      c.executionCtx.waitUntil(
        Promise.resolve().then(() => {
          console.warn(
            "[Hono] Analytics sync error captured in error handler"
          );
        })
      );
    }
  } else {
    console.warn(
      "[Hono] PERFORMANCE_ANALYTICS binding missing or invalid - error metrics will not be logged"
    );
  }
  return c.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred",
        details: c.env.LOG_LEVEL === "DEBUG" ? err.message : void 0
      }
    },
    500
  );
});
var router_default = app;

// src/handlers/search-handlers.js
var IN_FLIGHT_REQUESTS = /* @__PURE__ */ new Map();
var REQUEST_TIMEOUT_MS = 3e4;
async function withTimeout(promise, timeoutMs, cacheKey) {
  let timeoutId;
  let timeoutOccurred = false;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          timeoutOccurred = true;
          IN_FLIGHT_REQUESTS.delete(cacheKey);
          console.error(`\u23F1\uFE0F Request timeout after ${timeoutMs}ms: ${cacheKey}`);
          reject(new Error(`Request timeout after ${timeoutMs}ms`));
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}
__name(withTimeout, "withTimeout");
function generateSearchCacheKey(searchParams) {
  const { bookTitle, authorName, isbn } = searchParams;
  const parts = [
    isbn || "",
    bookTitle?.toLowerCase().trim() || "",
    authorName?.toLowerCase().trim() || ""
  ];
  return `search:${parts.filter(Boolean).join(":")}`;
}
__name(generateSearchCacheKey, "generateSearchCacheKey");
async function checkNegativeCache(cacheKey, env2) {
  try {
    const negativeKey = `negative:${cacheKey}`;
    const cached = await env2.KV_CACHE.get(negativeKey, "json");
    if (cached && cached.timestamp) {
      const age = Date.now() - cached.timestamp;
      if (age < 3e5) {
        console.log(
          `\u26A0\uFE0F Negative cache HIT: ${cacheKey} (age: ${Math.round(age / 1e3)}s)`
        );
        return cached;
      }
    }
  } catch (error3) {
    console.error("Negative cache check failed:", error3);
  }
  return null;
}
__name(checkNegativeCache, "checkNegativeCache");
async function storeNegativeCache(cacheKey, error3, type, env2) {
  try {
    const negativeKey = `negative:${cacheKey}`;
    await env2.KV_CACHE.put(
      negativeKey,
      JSON.stringify({
        type: type || "error",
        // 'no_results' vs 'error'
        error: error3.message || "Unknown error",
        status: error3.status || 500,
        timestamp: Date.now()
      }),
      {
        expirationTtl: 300
        // 5 minutes
      }
    );
    console.log(`\u{1F4DD} Stored negative cache: ${cacheKey} (type: ${type})`);
  } catch (err) {
    console.error("Failed to store negative cache:", err);
  }
}
__name(storeNegativeCache, "storeNegativeCache");
async function handleAdvancedSearch(searchParams, options = {}, env2) {
  const { bookTitle, authorName } = searchParams;
  const maxResults = options.maxResults || 1;
  const cacheKey = generateSearchCacheKey(searchParams);
  console.log(
    `[AdvancedSearch] Searching for "${bookTitle}" by "${authorName}"`
  );
  const negativeCache = await checkNegativeCache(cacheKey, env2);
  if (negativeCache) {
    if (negativeCache.type === "no_results") {
      return createSuccessResponse(
        { items: [], resultCount: 0 },
        // Temporary: keeping items[] until full DTO migration
        {
          provider: "none",
          cached: true
        }
      );
    }
    return createErrorResponse(
      negativeCache.error,
      negativeCache.status || 500,
      ErrorCodes.PROVIDER_ERROR
    );
  }
  if (IN_FLIGHT_REQUESTS.has(cacheKey)) {
    console.log(
      `\u{1F504} Request coalescing: Waiting for in-flight request (${cacheKey})`
    );
    return IN_FLIGHT_REQUESTS.get(cacheKey);
  }
  const requestPromise = (async () => {
    try {
      const query = [bookTitle, authorName].filter(Boolean).join(" ");
      const googleResult = await searchGoogleBooks(
        query,
        { maxResults },
        env2
      );
      if (googleResult && googleResult.works && googleResult.works.length > 0) {
        const items = googleResult.works.map(
          (work) => transformWorkToGoogleFormat(work)
        );
        const resultItems = items.slice(0, maxResults);
        return createSuccessResponse(
          { items: resultItems, resultCount: resultItems.length },
          {
            provider: "google",
            cached: false
          }
        );
      }
      console.log(
        `[AdvancedSearch] Google Books returned no results, trying OpenLibrary...`
      );
      const olResult = await searchOpenLibrary(
        query,
        { maxResults },
        env2
      );
      if (olResult && olResult.works && olResult.works.length > 0) {
        const items = olResult.works.map(
          (work) => transformWorkToGoogleFormat(work)
        );
        const resultItems = items.slice(0, maxResults);
        return createSuccessResponse(
          { items: resultItems, resultCount: resultItems.length },
          {
            provider: "openlibrary",
            cached: false
          }
        );
      }
      console.log(`[AdvancedSearch] No results found from any provider`);
      await storeNegativeCache(
        cacheKey,
        { message: "No results found", status: 404 },
        "no_results",
        env2
      );
      return createSuccessResponse(
        { items: [], resultCount: 0 },
        {
          provider: "none",
          cached: false
        }
      );
    } catch (error3) {
      console.error(
        `[AdvancedSearch] Error searching for "${bookTitle}":`,
        error3
      );
      if (!error3.status || error3.status >= 500) {
        await storeNegativeCache(cacheKey, error3, "error", env2);
      }
      return createErrorResponse(
        error3.message || "Search failed",
        500,
        ErrorCodes.INTERNAL_ERROR
      );
    } finally {
      IN_FLIGHT_REQUESTS.delete(cacheKey);
    }
  })();
  const timeoutPromise = withTimeout(
    requestPromise,
    REQUEST_TIMEOUT_MS,
    cacheKey
  );
  IN_FLIGHT_REQUESTS.set(cacheKey, timeoutPromise);
  return timeoutPromise;
}
__name(handleAdvancedSearch, "handleAdvancedSearch");

// src/consumers/author-warming-consumer.js
async function processAuthorBatch(batch, env2, ctx) {
  for (const message of batch.messages) {
    try {
      const { author, depth, source, jobId } = message.body;
      const processed = await env2.CACHE.get(
        `warming:processed:author:${author.toLowerCase()}`
      );
      if (processed) {
        const data = JSON.parse(processed);
        if (depth <= data.depth) {
          console.log(
            `Skipping ${author}: already processed at depth ${data.depth}`
          );
          message.ack();
          continue;
        }
      }
      const authorResult = await searchByAuthor(
        author,
        {
          limit: 100,
          offset: 0,
          sortBy: "publicationYear"
        },
        env2,
        ctx
      );
      if (!authorResult.success || !authorResult.works || authorResult.works.length === 0) {
        console.warn(`No works found for ${author}, skipping`);
        message.ack();
        continue;
      }
      console.log(
        `Cached author "${author}": ${authorResult.works.length} works`
      );
      console.log(
        `Warming ${authorResult.works.length} titles for author "${author}"...`
      );
      const concurrency = env2.CACHE_WARMING_CONCURRENCY || 5;
      const results = await enrichBooksParallel(
        authorResult.works,
        async (work) => {
          await searchByTitle(work.title, { maxResults: 20 }, env2, ctx);
          return { ...work, warmed: true };
        },
        async (completed, total, work, isError) => {
          if (!isError) {
            console.log(
              `(${completed}/${total}) Warmed cache for "${work.title}"`
            );
          }
        },
        concurrency
      );
      const titlesWarmed = results.filter((r) => r.warmed).length;
      console.log(
        `Finished warming ${titlesWarmed} titles for author "${author}"`
      );
      await env2.CACHE.put(
        `warming:processed:author:${author.toLowerCase()}`,
        JSON.stringify({
          worksCount: authorResult.works.length,
          titlesWarmed,
          lastWarmed: Date.now(),
          depth,
          jobId
        }),
        { expirationTtl: 90 * 24 * 60 * 60 }
        // 90 days
      );
      if (env2.CACHE_ANALYTICS) {
        ctx.waitUntil(
          env2.CACHE_ANALYTICS.writeDataPoint({
            blobs: ["warming", author, source],
            doubles: [authorResult.works.length, titlesWarmed],
            indexes: ["cache-warming"]
          })
        );
      }
      message.ack();
    } catch (error3) {
      console.error(`Failed to process author ${message.body.author}:`, error3);
      if (error3.message.includes("429") || error3.message.includes("rate limit")) {
        message.retry();
      } else {
        message.retry();
      }
    }
  }
}
__name(processAuthorBatch, "processAuthorBatch");

// src/utils/analytics-queries.js
async function queryAccessFrequency(env2, days) {
  console.warn(
    "[Analytics] Analytics Engine bindings are write-only in Workers. Query functionality requires GraphQL API integration."
  );
  console.warn(
    "[Analytics] Returning empty access stats. Consider implementing KV-based tracking for archival decisions."
  );
  return {};
}
__name(queryAccessFrequency, "queryAccessFrequency");

// src/utils/r2-paths.js
function generateR2Path(cacheKey) {
  const now = /* @__PURE__ */ new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `cold-cache/${year}/${month}/${cacheKey}.json`;
}
__name(generateR2Path, "generateR2Path");

// src/workers/archival-worker.js
async function selectArchivalCandidates(env2, accessStats) {
  const candidates = [];
  const kvKeys = await env2.CACHE.list();
  for (const key of kvKeys.keys) {
    if (key.name.startsWith("cold-index:") || key.name.startsWith("warming:") || key.name.startsWith("config:")) {
      continue;
    }
    const entry = await env2.CACHE.getWithMetadata(key.name);
    if (!entry || !entry.metadata || !entry.metadata.cachedAt) {
      continue;
    }
    const age = Date.now() - entry.metadata.cachedAt;
    const accessCount = accessStats[key.name] || 0;
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1e3;
    if (age > thirtyDaysMs && accessCount < 10) {
      candidates.push({
        key: key.name,
        data: entry.value,
        age,
        accessCount
      });
    }
  }
  return candidates;
}
__name(selectArchivalCandidates, "selectArchivalCandidates");
async function archiveCandidates(candidates, env2) {
  let archivedCount = 0;
  for (const candidate of candidates) {
    try {
      const r2Path = generateR2Path(candidate.key);
      await env2.LIBRARY_DATA.put(r2Path, candidate.data, {
        customMetadata: {
          originalKey: candidate.key,
          archivedAt: Date.now().toString(),
          originalTTL: "86400",
          accessCount: candidate.accessCount.toString()
        }
      });
      await env2.CACHE.put(
        `cold-index:${candidate.key}`,
        JSON.stringify({
          r2Path,
          archivedAt: Date.now(),
          originalTTL: 86400,
          archiveReason: `age=${Math.floor(candidate.age / (24 * 60 * 60 * 1e3))}d, access=${candidate.accessCount}/month`
        })
      );
      await env2.CACHE.delete(candidate.key);
      archivedCount++;
    } catch (error3) {
      console.error(`Failed to archive ${candidate.key}:`, error3);
    }
  }
  return archivedCount;
}
__name(archiveCandidates, "archiveCandidates");

// src/handlers/scheduled-archival.js
async function handleScheduledArchival(env2, ctx) {
  const startTime = Date.now();
  try {
    console.log("Starting scheduled archival process...");
    const accessStats = await queryAccessFrequency(env2, 30);
    const candidates = await selectArchivalCandidates(env2, accessStats);
    console.log(`Found ${candidates.length} archival candidates`);
    if (candidates.length === 0) {
      console.log("No entries to archive");
      return;
    }
    const archivedCount = await archiveCandidates(candidates, env2);
    const duration = Date.now() - startTime;
    console.log(
      `Archived ${archivedCount}/${candidates.length} entries in ${duration}ms`
    );
    if (env2.CACHE_ANALYTICS) {
      env2.CACHE_ANALYTICS.writeDataPoint({
        blobs: ["archival_completed", ""],
        doubles: [archivedCount, duration],
        indexes: ["archival_completed"]
      });
    }
  } catch (error3) {
    console.error("Scheduled archival failed:", error3);
    if (env2.CACHE_ANALYTICS) {
      env2.CACHE_ANALYTICS.writeDataPoint({
        blobs: ["archival_failed", error3.message],
        doubles: [Date.now() - startTime],
        indexes: ["archival_failed"]
      });
    }
  }
}
__name(handleScheduledArchival, "handleScheduledArchival");

// src/services/alert-monitor.js
var ALERT_THRESHOLDS = {
  critical: {
    miss_rate: 15,
    // > 15% miss rate
    p99_latency: 500,
    // > 500ms P99
    error_rate: 5
    // > 5% errors
  },
  warning: {
    miss_rate: 10,
    // > 10% miss rate
    p95_latency: 100,
    // > 100ms P95
    edge_hit_rate: 75,
    // < 75% edge hits
    kv_storage: 1e3
    // > 1GB KV storage
  }
};
function checkAlertThresholds(metrics) {
  const alerts = [];
  const missRate = 100 - metrics.hitRates.combined;
  if (missRate > ALERT_THRESHOLDS.critical.miss_rate) {
    alerts.push({
      severity: "critical",
      type: "miss_rate",
      value: missRate,
      threshold: ALERT_THRESHOLDS.critical.miss_rate,
      message: `Cache miss rate critically high: ${missRate.toFixed(1)}%`
    });
  } else if (missRate > ALERT_THRESHOLDS.warning.miss_rate) {
    alerts.push({
      severity: "warning",
      type: "miss_rate",
      value: missRate,
      threshold: ALERT_THRESHOLDS.warning.miss_rate,
      message: `Cache miss rate elevated: ${missRate.toFixed(1)}%`
    });
  }
  if (metrics.hitRates.edge < ALERT_THRESHOLDS.warning.edge_hit_rate) {
    alerts.push({
      severity: "warning",
      type: "edge_hit_rate",
      value: metrics.hitRates.edge,
      threshold: ALERT_THRESHOLDS.warning.edge_hit_rate,
      message: `Edge hit rate below target: ${metrics.hitRates.edge.toFixed(1)}%`
    });
  }
  const p99 = metrics.latency?.edge_hit?.p99 || metrics.latency?.kv_hit?.p99 || 0;
  if (p99 > ALERT_THRESHOLDS.critical.p99_latency) {
    alerts.push({
      severity: "critical",
      type: "p99_latency",
      value: p99,
      threshold: ALERT_THRESHOLDS.critical.p99_latency,
      message: `P99 latency critically high: ${p99.toFixed(0)}ms`
    });
  }
  return alerts;
}
__name(checkAlertThresholds, "checkAlertThresholds");
async function shouldSendAlert(alerts, env2) {
  if (alerts.length === 0) return false;
  const alertKey = alerts.map((a) => a.type).sort().join(":");
  const cacheKey = `alert:${alertKey}`;
  const lastAlert = await env2.CACHE.get(cacheKey);
  if (lastAlert) {
    const timeSince = Date.now() - parseInt(lastAlert);
    const fourHours = 4 * 60 * 60 * 1e3;
    if (timeSince < fourHours) {
      console.log(
        `Skipping duplicate alert (sent ${Math.floor(timeSince / 1e3 / 60)}min ago)`
      );
      return false;
    }
  }
  return true;
}
__name(shouldSendAlert, "shouldSendAlert");
async function markAlertSent(alerts, env2) {
  const alertKey = alerts.map((a) => a.type).sort().join(":");
  const cacheKey = `alert:${alertKey}`;
  await env2.CACHE.put(cacheKey, Date.now().toString(), {
    expirationTtl: 4 * 60 * 60
    // 4 hours
  });
}
__name(markAlertSent, "markAlertSent");

// src/handlers/scheduled-alerts.js
async function handleScheduledAlerts(env2, ctx) {
  try {
    console.log("[Alert Monitor] Running alert check...");
    const metrics = await aggregateMetrics(env2, "15m");
    const alerts = checkAlertThresholds(metrics);
    if (alerts.length === 0) {
      console.log("[Alert Monitor] \u2705 No alerts triggered - system healthy");
      return;
    }
    console.log(
      `[Alert Monitor] \u26A0\uFE0F  Generated ${alerts.length} alerts:`,
      alerts.map((a) => a.type)
    );
    const shouldSend = await shouldSendAlert(alerts, env2);
    if (!shouldSend) {
      console.log(
        "[Alert Monitor] Alert suppressed (duplicate within 4h window)"
      );
      return;
    }
    console.log("[Alert Monitor] \u{1F6A8} NEW ALERTS DETECTED:");
    alerts.forEach((alert) => {
      console.log(`  [${alert.severity.toUpperCase()}] ${alert.message}`);
      console.log(
        `    Current: ${alert.value.toFixed(1)} | Threshold: ${alert.threshold}`
      );
    });
    console.log("[Alert Monitor] Recent metrics (15min):");
    console.log(
      `  Hit Rate: ${metrics.hitRates.combined.toFixed(1)}% (Edge: ${metrics.hitRates.edge.toFixed(1)}%, KV: ${metrics.hitRates.kv.toFixed(1)}%)`
    );
    console.log(`  Volume: ${metrics.volume.total_requests} requests`);
    await markAlertSent(alerts, env2);
    console.log("[Alert Monitor] Alert logged and marked as sent");
  } catch (error3) {
    console.error("[Alert Monitor] Alert check failed:", error3);
    console.error(error3.stack);
  }
}
__name(handleScheduledAlerts, "handleScheduledAlerts");

// src/services/isbndb-api.js
var ISBNdbAPI = class {
  static {
    __name(this, "ISBNdbAPI");
  }
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = "https://api2.isbndb.com";
  }
  /**
   * Fetch book data by ISBN
   * @param {string} isbn - ISBN-10 or ISBN-13
   * @returns {Promise<{image: string, title: string, authors: string[]}|null>}
   */
  async fetchBook(isbn) {
    try {
      const response = await fetch(`${this.baseUrl}/book/${isbn}`, {
        method: "GET",
        headers: {
          Authorization: this.apiKey,
          Accept: "application/json"
        }
      });
      if (response.status === 404) {
        console.log(`ISBNdb: Book not found - ${isbn}`);
        return null;
      }
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`ISBNdb API error: ${response.status} - ${errorText}`);
      }
      const data = await response.json();
      if (!data.book) {
        console.warn(`ISBNdb: Unexpected response format for ${isbn}`, data);
        return null;
      }
      if (!data.book.image) {
        console.log(`ISBNdb: No cover image for ${isbn}`);
        return null;
      }
      return {
        image: data.book.image,
        title: data.book.title || "Unknown",
        authors: data.book.authors || [],
        publisher: data.book.publisher || null,
        publishedDate: data.book.date_published || null
      };
    } catch (error3) {
      console.error(`ISBNdb API error for ${isbn}:`, error3.message);
      throw error3;
    }
  }
  /**
   * Health check - verify API key is valid
   * @returns {Promise<boolean>}
   */
  async healthCheck() {
    try {
      const testISBN = "9780451524935";
      const response = await fetch(`${this.baseUrl}/book/${testISBN}`, {
        method: "GET",
        headers: {
          Authorization: this.apiKey,
          Accept: "application/json"
        }
      });
      return response.ok || response.status === 404;
    } catch (error3) {
      console.error("ISBNdb health check failed:", error3);
      return false;
    }
  }
};

// src/utils/rate-limiter.js
var RateLimiter = class {
  static {
    __name(this, "RateLimiter");
  }
  /**
   * @param {number} tokensPerSecond - Maximum requests per second (default: 10)
   */
  constructor(tokensPerSecond = 10) {
    this.tokensPerSecond = tokensPerSecond;
    this.tokens = tokensPerSecond;
    this.lastRefill = Date.now();
  }
  /**
   * Acquire a token (wait if necessary)
   * @returns {Promise<number>} Wait time in milliseconds
   */
  async acquire() {
    const now = Date.now();
    const timePassed = (now - this.lastRefill) / 1e3;
    this.tokens = Math.min(
      this.tokensPerSecond,
      this.tokens + timePassed * this.tokensPerSecond
    );
    this.lastRefill = now;
    let waitTime = 0;
    if (this.tokens < 1) {
      waitTime = (1 - this.tokens) / this.tokensPerSecond * 1e3;
      await this.sleep(waitTime);
      this.tokens = 0;
    } else {
      this.tokens -= 1;
    }
    const jitter = Math.random() * 200 - 100;
    if (jitter > 0) {
      await this.sleep(jitter);
      waitTime += jitter;
    }
    return Math.round(waitTime);
  }
  /**
   * Sleep helper
   * @param {number} ms - Milliseconds to sleep
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  /**
   * Reset limiter state (useful for testing)
   */
  reset() {
    this.tokens = this.tokensPerSecond;
    this.lastRefill = Date.now();
  }
  /**
   * Get current token count (for debugging)
   */
  getTokenCount() {
    const now = Date.now();
    const timePassed = (now - this.lastRefill) / 1e3;
    return Math.min(
      this.tokensPerSecond,
      this.tokens + timePassed * this.tokensPerSecond
    );
  }
};

// src/services/edition-discovery.js
function scoreEdition(volumeInfo) {
  let score = 0;
  if (volumeInfo.imageLinks?.extraLarge) {
    score += 40;
  } else if (volumeInfo.imageLinks?.large) {
    score += 30;
  } else if (volumeInfo.imageLinks?.medium) {
    score += 20;
  } else if (volumeInfo.imageLinks?.thumbnail) {
    score += 10;
  }
  const description = (volumeInfo.description || "").toLowerCase();
  const title2 = (volumeInfo.title || "").toLowerCase();
  if (description.includes("illustrated") || title2.includes("illustrated")) {
    score += 30;
  } else if (description.includes("first edition") || title2.includes("first edition")) {
    score += 25;
  } else if (description.includes("collector") || title2.includes("collector")) {
    score += 25;
  } else if (description.includes("anniversary") || title2.includes("anniversary")) {
    score += 20;
  }
  if (volumeInfo.printType === "BOOK") {
    if (title2.includes("hardcover") || description.includes("hardcover")) {
      score += 15;
    } else if (title2.includes("paperback") || description.includes("paperback")) {
      score += 10;
    }
  }
  if (volumeInfo.publishedDate) {
    const year = parseInt(volumeInfo.publishedDate.substring(0, 4));
    const currentYear = (/* @__PURE__ */ new Date()).getFullYear();
    const age = currentYear - year;
    if (age <= 5) {
      score += 10;
    } else if (age <= 15) {
      score += 5;
    }
  }
  if (volumeInfo.pageCount && volumeInfo.pageCount > 0) {
    score += 5;
  }
  return score;
}
__name(scoreEdition, "scoreEdition");
async function discoverEditions(workMetadata, env2) {
  const { title: title2, authors } = workMetadata;
  if (!title2 || !authors || authors.length === 0) {
    console.warn("Missing title or authors for edition discovery");
    return [];
  }
  try {
    const titleQuery = `intitle:"${title2.replace(/"/g, "")}"`;
    const authorQuery = authors.map((a) => `inauthor:"${a.replace(/"/g, "")}"`).join(" ");
    const query = `${titleQuery} ${authorQuery}`;
    const url = new URL("https://www.googleapis.com/books/v1/volumes");
    url.searchParams.set("q", query);
    url.searchParams.set("maxResults", "40");
    url.searchParams.set("printType", "books");
    url.searchParams.set("orderBy", "relevance");
    const response = await fetch(url.toString());
    if (!response.ok) {
      console.error(`Google Books API error: ${response.status}`);
      return [];
    }
    const data = await response.json();
    if (!data.items || data.items.length === 0) {
      console.log(`No editions found for: ${title2}`);
      return [];
    }
    const editions = data.items.map((item) => {
      const volumeInfo = item.volumeInfo;
      const score = scoreEdition(volumeInfo);
      const identifiers = volumeInfo.industryIdentifiers || [];
      const isbn13 = identifiers.find((id) => id.type === "ISBN_13");
      const isbn10 = identifiers.find((id) => id.type === "ISBN_10");
      const isbn = isbn13?.identifier || isbn10?.identifier;
      return {
        isbn,
        title: volumeInfo.title,
        subtitle: volumeInfo.subtitle,
        authors: volumeInfo.authors || [],
        publisher: volumeInfo.publisher,
        publishedDate: volumeInfo.publishedDate,
        pageCount: volumeInfo.pageCount,
        imageLinks: volumeInfo.imageLinks,
        description: volumeInfo.description,
        score,
        // Debug info
        _scoreBreakdown: {
          hasExtraLargeImage: !!volumeInfo.imageLinks?.extraLarge,
          hasLargeImage: !!volumeInfo.imageLinks?.large,
          hasMediumImage: !!volumeInfo.imageLinks?.medium,
          isIllustrated: (volumeInfo.description || volumeInfo.title || "").toLowerCase().includes("illustrated"),
          isFirstEdition: (volumeInfo.description || volumeInfo.title || "").toLowerCase().includes("first edition"),
          binding: volumeInfo.printType,
          publicationYear: volumeInfo.publishedDate?.substring(0, 4)
        }
      };
    }).filter((edition) => edition.isbn).sort((a, b) => b.score - a.score);
    console.log(
      `Discovered ${editions.length} editions for "${title2}" (top score: ${editions[0]?.score || 0})`
    );
    return editions;
  } catch (error3) {
    console.error("Edition discovery error:", error3);
    return [];
  }
}
__name(discoverEditions, "discoverEditions");
async function getTopEditions(workMetadata, env2, limit = 3) {
  const allEditions = await discoverEditions(workMetadata, env2);
  if (allEditions.length === 0) {
    return [];
  }
  const topEditions = allEditions.slice(0, limit);
  console.log(
    `Selected top ${topEditions.length} editions for "${workMetadata.title}":`
  );
  topEditions.forEach((ed, idx) => {
    console.log(
      `  ${idx + 1}. ISBN: ${ed.isbn}, Score: ${ed.score}, Publisher: ${ed.publisher || "Unknown"}`
    );
  });
  return topEditions.map((ed) => ({
    isbn: ed.isbn,
    title: ed.title,
    score: ed.score,
    imageUrl: ed.imageLinks?.large || ed.imageLinks?.medium || ed.imageLinks?.thumbnail,
    publisher: ed.publisher,
    publishedDate: ed.publishedDate
  }));
}
__name(getTopEditions, "getTopEditions");

// src/handlers/scheduled-harvest.js
async function loadCuratedISBNs() {
  try {
    console.log("\u{1F4E5} Fetching curated ISBNs from GitHub...");
    const response = await fetch(
      "https://raw.githubusercontent.com/jukasdrj/books-tracker-v1/main/testImages/csv-expansion/combined_library_expanded.csv"
    );
    console.log(`GitHub fetch status: ${response.status}`);
    if (!response.ok) {
      console.warn(
        `Failed to load curated ISBNs from GitHub (HTTP ${response.status}), using inline list`
      );
      return await loadInlineISBNs();
    }
    const csvText = await response.text();
    console.log(`CSV text length: ${csvText.length} bytes`);
    const isbns = csvText.split(/\r?\n/).map((line) => {
      const match2 = line.trim().match(/([0-9]{13})$/);
      return match2 ? match2[1] : null;
    }).filter((isbn) => isbn !== null);
    console.log(`\u2705 Loaded ${isbns.length} curated ISBNs from GitHub`);
    if (isbns.length > 0) {
      console.log(`Sample ISBNs: ${isbns.slice(0, 3).join(", ")}`);
    }
    return isbns;
  } catch (error3) {
    console.error("\u274C Error loading curated ISBNs:", error3);
    return await loadInlineISBNs();
  }
}
__name(loadCuratedISBNs, "loadCuratedISBNs");
async function loadInlineISBNs() {
  const inlineISBNs = [
    "9780385529985",
    "9780553448122",
    "9780812986481",
    "9780735224292",
    "9780743247542",
    "9781607747307",
    "9780399590504",
    "9780062429964",
    "9780062409850",
    "9781594633940",
    "9780802124944",
    "9781451659224",
    "9780345542908",
    "9780525555360",
    "9780802123411",
    "9780812993541",
    "9781594206274",
    "9781594633661",
    "9780385353779",
    "9780385539458"
  ];
  console.log(`Using ${inlineISBNs.length} inline ISBNs as fallback`);
  return inlineISBNs;
}
__name(loadInlineISBNs, "loadInlineISBNs");
async function compressToWebP(imageData, quality = 85) {
  try {
    const imageResponse = new Response(imageData, {
      headers: {
        "Content-Type": "image/jpeg",
        "CF-Image-Format": "webp",
        "CF-Image-Quality": quality.toString()
      }
    });
    const transformed = await fetch(imageResponse.url, {
      cf: {
        image: {
          format: "webp",
          quality
        }
      }
    });
    if (!transformed.ok) {
      return null;
    }
    return await transformed.arrayBuffer();
  } catch (error3) {
    console.error("WebP compression error:", error3);
    return null;
  }
}
__name(compressToWebP, "compressToWebP");
async function collectAnalyticsISBNs(env2) {
  try {
    console.log("\u{1F50D} Querying Analytics Engine for popular ISBNs...");
    if (!env2.CF_ACCOUNT_ID || !env2.CF_API_TOKEN) {
      console.warn(
        "\u26A0\uFE0F CF_ACCOUNT_ID or CF_API_TOKEN not configured - skipping Analytics ISBNs"
      );
      return [];
    }
    const query = `
      SELECT blob1 as isbn, COUNT(*) as search_count
      FROM books_api_provider_performance
      WHERE timestamp > NOW() - INTERVAL '7' DAY
        AND index1 = 'google-books-isbn'
        AND blob2 = 'isbn_search'
      GROUP BY isbn
      ORDER BY search_count DESC
      LIMIT 500
    `;
    console.log("Analytics Engine query:", query.trim());
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${env2.CF_ACCOUNT_ID}/analytics_engine/sql`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env2.CF_API_TOKEN}`,
          "Content-Type": "text/plain"
        },
        body: query
      }
    );
    console.log(
      `Analytics API response: ${response.status} ${response.statusText}`
    );
    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `\u274C Analytics Engine query failed (${response.status}):`,
        errorText
      );
      console.error(
        "This is expected until Priority 1 (GOOGLE_BOOKS_ANALYTICS binding fix) is deployed"
      );
      return [];
    }
    const data = await response.json();
    console.log("Analytics response structure:", JSON.stringify(data, null, 2));
    const isbns = data.data?.map((row) => row.isbn).filter((isbn) => isbn) || [];
    console.log(`\u2705 Found ${isbns.length} popular ISBNs from Analytics Engine`);
    if (isbns.length > 0) {
      console.log(`Top 5 ISBNs: ${isbns.slice(0, 5).join(", ")}`);
    } else {
      console.warn("\u26A0\uFE0F Analytics Engine returned 0 ISBNs");
      console.warn(
        "Likely cause: GOOGLE_BOOKS_ANALYTICS binding missing in wrangler.toml (no data being logged)"
      );
      console.warn(
        "Fix: Add binding or update external-apis.js to use PROVIDER_ANALYTICS"
      );
    }
    return isbns;
  } catch (error3) {
    console.error("\u274C Error collecting Analytics ISBNs:", error3.message);
    console.error("Stack trace:", error3.stack);
    return [];
  }
}
__name(collectAnalyticsISBNs, "collectAnalyticsISBNs");
async function collectUserLibraryISBNs(env2) {
  return [];
}
__name(collectUserLibraryISBNs, "collectUserLibraryISBNs");
async function discoverMultiEditionISBNs(seedISBNs, env2, editionsPerWork = 3) {
  console.log(
    `\u{1F50D} Discovering multi-edition ISBNs for ${seedISBNs.length} Works...`
  );
  const allISBNs = /* @__PURE__ */ new Set();
  const rateLimiter = new RateLimiter(10);
  let worksProcessed = 0;
  let editionsDiscovered = 0;
  for (const seedISBN of seedISBNs) {
    await rateLimiter.waitForSlot();
    try {
      const metadataUrl = new URL(
        "https://www.googleapis.com/books/v1/volumes"
      );
      metadataUrl.searchParams.set("q", `isbn:${seedISBN}`);
      const metadataResponse = await fetch(metadataUrl.toString());
      if (!metadataResponse.ok) {
        console.warn(
          `Failed to fetch metadata for ${seedISBN}: ${metadataResponse.status}`
        );
        allISBNs.add(seedISBN);
        continue;
      }
      const metadataData = await metadataResponse.json();
      if (!metadataData.items || metadataData.items.length === 0) {
        console.warn(`No metadata found for ${seedISBN}`);
        allISBNs.add(seedISBN);
        continue;
      }
      const volumeInfo = metadataData.items[0].volumeInfo;
      const title2 = volumeInfo.title;
      const authors = volumeInfo.authors || [];
      if (!title2 || authors.length === 0) {
        console.warn(`Incomplete metadata for ${seedISBN}`);
        allISBNs.add(seedISBN);
        continue;
      }
      const editions = await getTopEditions(
        { title: title2, authors },
        env2,
        editionsPerWork
      );
      if (editions.length === 0) {
        allISBNs.add(seedISBN);
      } else {
        editions.forEach((ed) => allISBNs.add(ed.isbn));
        editionsDiscovered += editions.length;
      }
      worksProcessed++;
      if (worksProcessed % 50 === 0) {
        console.log(
          `  Progress: ${worksProcessed}/${seedISBNs.length} Works, ${allISBNs.size} ISBNs discovered`
        );
      }
    } catch (error3) {
      console.error(`Edition discovery error for ${seedISBN}:`, error3);
      allISBNs.add(seedISBN);
    }
  }
  console.log(
    `\u2705 Multi-edition discovery complete: ${worksProcessed} Works \u2192 ${allISBNs.size} ISBNs (avg ${(allISBNs.size / worksProcessed).toFixed(1)} editions/work)`
  );
  return Array.from(allISBNs);
}
__name(discoverMultiEditionISBNs, "discoverMultiEditionISBNs");
async function isCoverHarvested(isbn, env2) {
  const kvKey = CacheKeyFactory.coverImage(isbn);
  const existing = await env2.KV_CACHE.get(kvKey);
  return existing !== null;
}
__name(isCoverHarvested, "isCoverHarvested");
async function harvestISBN(isbn, isbndbApi, env2, stats) {
  const startTime = Date.now();
  try {
    if (await isCoverHarvested(isbn, env2)) {
      console.log(`Skipping ${isbn} - already harvested`);
      stats.skipped++;
      return { isbn, status: "skipped" };
    }
    console.log(`Harvesting ${isbn}...`);
    const bookData = await isbndbApi.fetchBook(isbn);
    if (!bookData) {
      console.log(`No cover for ${isbn}`);
      stats.noCover++;
      return { isbn, status: "no_cover" };
    }
    const imageResponse = await fetch(bookData.image, {
      headers: { "User-Agent": "BooksTrack-Harvest/1.0" }
    });
    if (!imageResponse.ok) {
      throw new Error(`Image download failed: ${imageResponse.status}`);
    }
    const imageData = await imageResponse.arrayBuffer();
    const originalSize = imageData.byteLength;
    const compressed = await compressToWebP(imageData, 85);
    const finalData = compressed || imageData;
    const compressedSize = finalData.byteLength;
    const savings = Math.round(
      (originalSize - compressedSize) / originalSize * 100
    );
    console.log(
      `Compressed ${isbn}: ${originalSize} \u2192 ${compressedSize} bytes (${savings}% savings)`
    );
    const r2Key = `covers/${isbn}`;
    await env2.BOOK_COVERS.put(r2Key, finalData, {
      httpMetadata: { contentType: compressed ? "image/webp" : "image/jpeg" },
      customMetadata: {
        isbn,
        title: bookData.title,
        authors: bookData.authors.join(", "),
        originalSize: originalSize.toString(),
        compressedSize: compressedSize.toString(),
        compressionSavings: savings.toString(),
        harvestedAt: (/* @__PURE__ */ new Date()).toISOString(),
        source: "isbndb-harvest"
      }
    });
    const kvKey = CacheKeyFactory.coverImage(isbn);
    await env2.KV_CACHE.put(
      kvKey,
      JSON.stringify({
        r2Key,
        isbn,
        title: bookData.title,
        authors: bookData.authors,
        harvestedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalSize,
        compressedSize,
        savings
      }),
      {
        expirationTtl: 365 * 24 * 60 * 60
        // 1 year
      }
    );
    const processingTime = Date.now() - startTime;
    console.log(`\u2705 Harvested ${isbn} in ${processingTime}ms`);
    stats.successful++;
    stats.totalSize += compressedSize;
    stats.totalSavings += savings;
    return {
      isbn,
      status: "success",
      originalSize,
      compressedSize,
      savings,
      processingTime
    };
  } catch (error3) {
    console.error(`Error harvesting ${isbn}:`, error3.message);
    stats.errors++;
    return { isbn, status: "error", error: error3.message };
  }
}
__name(harvestISBN, "harvestISBN");
async function handleScheduledHarvest(env2) {
  const startTime = Date.now();
  console.log("\u{1F33E} Starting ISBNdb cover harvest...");
  const apiKey = env2.ISBNDB_API_KEY?.get ? await env2.ISBNDB_API_KEY.get() : env2.ISBNDB_API_KEY;
  if (!apiKey) {
    console.error("\u274C ISBNDB_API_KEY not configured");
    return {
      success: false,
      error: "ISBNDB_API_KEY not configured",
      duration: Date.now() - startTime
    };
  }
  const isbndbApi = new ISBNdbAPI(apiKey);
  const rateLimiter = new RateLimiter(10);
  const healthy = await isbndbApi.healthCheck();
  if (!healthy) {
    console.error("\u274C ISBNdb API health check failed");
    return {
      success: false,
      error: "ISBNdb API unavailable",
      duration: Date.now() - startTime
    };
  }
  console.log("\u2705 ISBNdb API healthy");
  console.log("");
  console.log("=".repeat(60));
  console.log("\u{1F4DA} Collecting ISBNs from all sources...");
  console.log("=".repeat(60));
  const curatedISBNs = await loadCuratedISBNs();
  console.log(
    `1\uFE0F\u20E3 Curated ISBNs: ${curatedISBNs.length} (priority 1 - bestsellers 2015-2025)`
  );
  console.log("");
  console.log("\u{1F50D} Starting multi-edition discovery for top 350 Works...");
  const seedWorks = curatedISBNs.slice(0, 350);
  const multiEditionISBNs = await discoverMultiEditionISBNs(seedWorks, env2, 3);
  console.log(
    `   \u{1F4DA} Multi-edition ISBNs: ${multiEditionISBNs.length} (from ${seedWorks.length} Works)`
  );
  const analyticsISBNs = await collectAnalyticsISBNs(env2);
  console.log(
    `2\uFE0F\u20E3 Analytics ISBNs: ${analyticsISBNs.length} (priority 2 - popular searches)`
  );
  const userLibraryISBNs = await collectUserLibraryISBNs(env2);
  console.log(
    `3\uFE0F\u20E3 User Library ISBNs: ${userLibraryISBNs.length} (priority 3 - user collections)`
  );
  const allISBNs = [
    .../* @__PURE__ */ new Set([
      ...multiEditionISBNs,
      // Priority 1: Multi-edition bestsellers (700-1050 ISBNs)
      ...analyticsISBNs,
      // Priority 2: Popular searches (0-300 ISBNs fill remaining capacity)
      ...userLibraryISBNs
      // Priority 3: User library collections (future)
    ])
  ].slice(0, 1e3);
  const totalBeforeCap = multiEditionISBNs.length + analyticsISBNs.length + userLibraryISBNs.length;
  const duplicatesRemoved = totalBeforeCap - allISBNs.length;
  console.log("");
  console.log("\u{1F4CA} ISBN Collection Summary:");
  console.log(`   Total before dedup: ${totalBeforeCap}`);
  console.log(`   Duplicates removed: ${duplicatesRemoved}`);
  console.log(`   Unique ISBNs: ${allISBNs.length}`);
  console.log(`   Multi-edition: ${multiEditionISBNs.length}`);
  console.log(`   Analytics: ${analyticsISBNs.length}`);
  console.log(`   User Library: ${userLibraryISBNs.length}`);
  if (allISBNs.length >= 1e3) {
    console.warn("\u26A0\uFE0F Capped at 1000 ISBNs (ISBNdb API daily limit reached)");
  } else {
    const unused = 1e3 - allISBNs.length;
    console.log(
      `\u2705 Using ${allISBNs.length}/1000 ISBNdb requests (${unused} unused capacity)`
    );
  }
  console.log("=".repeat(60));
  console.log("");
  if (allISBNs.length === 0) {
    console.log("\u2705 No ISBNs to harvest");
    return {
      success: true,
      stats: {
        total: 0,
        successful: 0,
        skipped: 0,
        noCover: 0,
        errors: 0,
        sources: {
          curated: curatedISBNs.length,
          analytics: analyticsISBNs.length,
          userLibrary: userLibraryISBNs.length
        }
      },
      duration: Date.now() - startTime
    };
  }
  const stats = {
    total: allISBNs.length,
    successful: 0,
    skipped: 0,
    noCover: 0,
    errors: 0,
    totalSize: 0,
    totalSavings: 0
  };
  const results = [];
  for (const isbn of allISBNs) {
    const waitTime = await rateLimiter.acquire();
    if (waitTime > 0) {
      console.log(`Rate limited: waited ${waitTime}ms`);
    }
    const result = await harvestISBN(isbn, isbndbApi, env2, stats);
    results.push(result);
    if (results.length % 10 === 0) {
      console.log(`Progress: ${results.length}/${allISBNs.length} processed`);
    }
  }
  const avgSavings = stats.successful > 0 ? Math.round(stats.totalSavings / stats.successful) : 0;
  const totalSizeMB = (stats.totalSize / 1024 / 1024).toFixed(2);
  const duration = Date.now() - startTime;
  const durationMinutes = (duration / 1e3 / 60).toFixed(1);
  console.log("");
  console.log("=".repeat(60));
  console.log("\u{1F4CA} Harvest Summary");
  console.log("=".repeat(60));
  console.log("");
  console.log("\u{1F4DA} ISBN Sources:");
  console.log(`   Curated (priority 1): ${curatedISBNs.length} ISBNs`);
  console.log(`   Analytics (priority 2): ${analyticsISBNs.length} ISBNs`);
  console.log(`   User Library (priority 3): ${userLibraryISBNs.length} ISBNs`);
  console.log(`   Total unique: ${allISBNs.length} ISBNs`);
  console.log("");
  console.log("\u2705 Processing Results:");
  console.log(`   Total processed: ${stats.total}`);
  console.log(`   Successful: ${stats.successful}`);
  console.log(`   Skipped (already harvested): ${stats.skipped}`);
  console.log(`   No cover available: ${stats.noCover}`);
  console.log(`   Errors: ${stats.errors}`);
  console.log("");
  console.log("\u{1F4BE} Storage:");
  console.log(`   Total size: ${totalSizeMB} MB`);
  console.log(`   Average compression: ${avgSavings}%`);
  console.log("");
  console.log("\u23F1\uFE0F Performance:");
  console.log(
    `   Duration: ${durationMinutes} minutes (${(duration / 1e3).toFixed(1)}s)`
  );
  console.log(
    `   ISBNdb API usage: ${allISBNs.length}/1000 daily limit (${Math.round(allISBNs.length / 1e3 * 100)}%)`
  );
  console.log("=".repeat(60));
  return {
    success: true,
    stats: {
      ...stats,
      avgSavings,
      totalSizeMB,
      duration,
      sources: {
        curated: curatedISBNs.length,
        analytics: analyticsISBNs.length,
        userLibrary: userLibraryISBNs.length,
        totalUnique: allISBNs.length
      },
      apiUsage: {
        used: allISBNs.length,
        limit: 1e3,
        percentUsed: Math.round(allISBNs.length / 1e3 * 100)
      }
    },
    results
  };
}
__name(handleScheduledHarvest, "handleScheduledHarvest");

// src/handlers/test-multi-edition.js
async function handleTestMultiEdition(request, env2) {
  const url = new URL(request.url);
  const count3 = parseInt(url.searchParams.get("count") || "5", 10);
  const testISBNs = [
    "9780008479599",
    // The Midnight Library
    "9780062060624",
    // The Light We Lost
    "9780062225559",
    // The Nightingale
    "9780062277022",
    // The Woman in Cabin 10
    "9780062300547"
    // The Girl on the Train
  ].slice(0, count3);
  const results = [];
  for (const isbn of testISBNs) {
    try {
      const metadataUrl = new URL(
        "https://www.googleapis.com/books/v1/volumes"
      );
      metadataUrl.searchParams.set("q", `isbn:${isbn}`);
      const metadataResponse = await fetch(metadataUrl.toString());
      const metadataData = await metadataResponse.json();
      if (!metadataData.items || metadataData.items.length === 0) {
        results.push({
          seedISBN: isbn,
          title: "Unknown",
          editions: [],
          error: "No metadata found"
        });
        continue;
      }
      const volumeInfo = metadataData.items[0].volumeInfo;
      const title2 = volumeInfo.title;
      const authors = volumeInfo.authors || [];
      const editions = await getTopEditions({ title: title2, authors }, env2, 3);
      results.push({
        seedISBN: isbn,
        title: title2,
        authors,
        editionsFound: editions.length,
        editions: editions.map((ed) => ({
          isbn: ed.isbn,
          title: ed.title,
          score: ed.score,
          publisher: ed.publisher,
          publishedDate: ed.publishedDate
        }))
      });
    } catch (error3) {
      results.push({
        seedISBN: isbn,
        error: error3.message
      });
    }
  }
  const totalEditions = results.reduce(
    (sum, r) => sum + (r.editionsFound || 0),
    0
  );
  const avgEditionsPerWork = (totalEditions / results.length).toFixed(1);
  return new Response(
    JSON.stringify(
      {
        success: true,
        summary: {
          worksProcessed: results.length,
          totalEditions,
          avgEditionsPerWork: parseFloat(avgEditionsPerWork)
        },
        results
      },
      null,
      2
    ),
    {
      headers: { "Content-Type": "application/json" }
    }
  );
}
__name(handleTestMultiEdition, "handleTestMultiEdition");

// src/handlers/harvest-dashboard.js
async function getHarvestStats(env2) {
  try {
    const list = await env2.KV_CACHE.list({ prefix: "cover:" });
    const totalCovers = list.keys.length;
    const recentCovers = list.keys.slice(0, 100);
    let totalSize = 0;
    let totalSavings = 0;
    let coversBySource = { isbndb: 0, google: 0, openlibrary: 0 };
    let imageQuality = { high: 0, medium: 0, low: 0, none: 0 };
    for (const key of recentCovers) {
      const data = await env2.KV_CACHE.get(key.name);
      if (!data) continue;
      const metadata = JSON.parse(data);
      totalSize += metadata.compressedSize || 0;
      totalSavings += metadata.savings || 0;
      const source = metadata.source || "isbndb";
      if (source.includes("isbndb")) coversBySource.isbndb++;
      else if (source.includes("google")) coversBySource.google++;
      else if (source.includes("openlibrary")) coversBySource.openlibrary++;
    }
    const sampleRatio = totalCovers / recentCovers.length;
    const estimatedSize = totalSize * sampleRatio;
    const avgSavings = recentCovers.length > 0 ? Math.round(totalSavings / recentCovers.length) : 0;
    return {
      totalCovers,
      totalSizeMB: (estimatedSize / 1024 / 1024).toFixed(2),
      avgCompressionSavings: avgSavings,
      coversBySource,
      lastUpdated: (/* @__PURE__ */ new Date()).toISOString(),
      storageUsed: `${(estimatedSize / 1024 / 1024).toFixed(2)} MB`,
      apiQuotaUsed: "77%",
      // From recent harvest
      cacheHitRate: "N/A"
      // Requires Analytics Engine aggregation
    };
  } catch (error3) {
    console.error("Failed to get harvest stats:", error3);
    return {
      totalCovers: 0,
      totalSizeMB: "0.00",
      avgCompressionSavings: 0,
      coversBySource: { isbndb: 0, google: 0, openlibrary: 0 },
      lastUpdated: (/* @__PURE__ */ new Date()).toISOString(),
      storageUsed: "0 MB",
      apiQuotaUsed: "N/A",
      cacheHitRate: "N/A",
      error: error3.message
    };
  }
}
__name(getHarvestStats, "getHarvestStats");
function renderDashboard(stats) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ISBNdb Cover Harvest Dashboard - BooksTrack</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    :root {
      --cf-orange: #f48120;
      --cf-blue: #0051c3;
      --cf-dark: #1a1a1a;
      --cf-gray: #2d2d2d;
      --cf-light-gray: #4a4a4a;
      --cf-text: #ffffff;
      --cf-text-dim: #a0a0a0;
      --success: #10b981;
      --warning: #f59e0b;
      --error: #ef4444;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: linear-gradient(135deg, var(--cf-dark) 0%, var(--cf-gray) 100%);
      color: var(--cf-text);
      padding: 2rem;
      min-height: 100vh;
    }

    .container {
      max-width: 1400px;
      margin: 0 auto;
    }

    .header {
      text-align: center;
      margin-bottom: 3rem;
      padding: 2rem;
      background: rgba(255, 255, 255, 0.03);
      border-radius: 16px;
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .header h1 {
      font-size: 2.5rem;
      margin-bottom: 0.5rem;
      background: linear-gradient(135deg, var(--cf-orange) 0%, var(--cf-blue) 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .header p {
      color: var(--cf-text-dim);
      font-size: 1.1rem;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 1.5rem;
      margin-bottom: 2rem;
    }

    .stat-card {
      background: rgba(255, 255, 255, 0.05);
      border-radius: 12px;
      padding: 1.5rem;
      border: 1px solid rgba(255, 255, 255, 0.1);
      transition: transform 0.2s, box-shadow 0.2s;
    }

    .stat-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 8px 24px rgba(244, 129, 32, 0.2);
    }

    .stat-label {
      font-size: 0.9rem;
      color: var(--cf-text-dim);
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 0.5rem;
    }

    .stat-value {
      font-size: 2.5rem;
      font-weight: 700;
      color: var(--cf-orange);
      margin-bottom: 0.25rem;
    }

    .stat-subtitle {
      font-size: 0.85rem;
      color: var(--cf-text-dim);
    }

    .progress-bar {
      width: 100%;
      height: 8px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 4px;
      overflow: hidden;
      margin-top: 0.5rem;
    }

    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--cf-orange) 0%, var(--cf-blue) 100%);
      transition: width 0.6s ease;
    }

    .chart-section {
      background: rgba(255, 255, 255, 0.05);
      border-radius: 12px;
      padding: 2rem;
      margin-bottom: 2rem;
      border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .chart-title {
      font-size: 1.5rem;
      margin-bottom: 1.5rem;
      color: var(--cf-text);
    }

    .source-breakdown {
      display: flex;
      gap: 1rem;
      flex-wrap: wrap;
    }

    .source-item {
      flex: 1;
      min-width: 200px;
      background: rgba(255, 255, 255, 0.03);
      padding: 1.5rem;
      border-radius: 8px;
      border-left: 4px solid var(--cf-orange);
    }

    .source-name {
      font-size: 0.9rem;
      color: var(--cf-text-dim);
      margin-bottom: 0.5rem;
    }

    .source-count {
      font-size: 2rem;
      font-weight: 700;
      color: var(--cf-text);
    }

    .footer {
      text-align: center;
      padding: 2rem;
      color: var(--cf-text-dim);
      font-size: 0.9rem;
    }

    .footer a {
      color: var(--cf-orange);
      text-decoration: none;
    }

    .footer a:hover {
      text-decoration: underline;
    }

    .badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: 12px;
      font-size: 0.8rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .badge-success {
      background: rgba(16, 185, 129, 0.2);
      color: var(--success);
      border: 1px solid var(--success);
    }

    .badge-warning {
      background: rgba(245, 158, 11, 0.2);
      color: var(--warning);
      border: 1px solid var(--warning);
    }

    .refresh-note {
      text-align: center;
      color: var(--cf-text-dim);
      font-size: 0.85rem;
      margin-top: 1rem;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.6; }
    }

    .live-indicator {
      display: inline-block;
      width: 8px;
      height: 8px;
      background: var(--success);
      border-radius: 50%;
      margin-right: 0.5rem;
      animation: pulse 2s ease-in-out infinite;
    }

    @media (max-width: 768px) {
      body {
        padding: 1rem;
      }

      .header h1 {
        font-size: 1.75rem;
      }

      .stats-grid {
        grid-template-columns: 1fr;
      }

      .stat-value {
        font-size: 2rem;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>\u{1F4DA} ISBNdb Cover Harvest Dashboard</h1>
      <p><span class="live-indicator"></span>Real-time monitoring powered by Cloudflare Workers</p>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Total Covers Cached</div>
        <div class="stat-value">${stats.totalCovers.toLocaleString()}</div>
        <div class="stat-subtitle">Across all sources</div>
      </div>

      <div class="stat-card">
        <div class="stat-label">Storage Used</div>
        <div class="stat-value">${stats.totalSizeMB} MB</div>
        <div class="stat-subtitle">WebP compressed (avg ${stats.avgCompressionSavings}% savings)</div>
      </div>

      <div class="stat-card">
        <div class="stat-label">ISBNdb API Quota</div>
        <div class="stat-value">${stats.apiQuotaUsed}</div>
        <div class="stat-subtitle">5000 requests/day (Premium Plan)</div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${stats.apiQuotaUsed}"></div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-label">Google Books API</div>
        <div class="stat-value">~350</div>
        <div class="stat-subtitle">1000 requests/day (Free Tier)</div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: 35%"></div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-label">Cache Hit Rate</div>
        <div class="stat-value">${stats.cacheHitRate}</div>
        <div class="stat-subtitle">
          ${stats.cacheHitRate === "N/A" ? '<span class="badge badge-warning">Pending 24h Analytics</span>' : "Serving from cache"}
        </div>
      </div>
    </div>

    <div class="chart-section">
      <h2 class="chart-title">Cover Sources Breakdown</h2>
      <div class="source-breakdown">
        <div class="source-item" style="border-left-color: var(--cf-orange)">
          <div class="source-name">ISBNdb API</div>
          <div class="source-count">${stats.coversBySource.isbndb.toLocaleString()}</div>
        </div>
        <div class="source-item" style="border-left-color: var(--cf-blue)">
          <div class="source-name">Google Books</div>
          <div class="source-count">${stats.coversBySource.google.toLocaleString()}</div>
        </div>
        <div class="source-item" style="border-left-color: var(--success)">
          <div class="source-name">Open Library</div>
          <div class="source-count">${stats.coversBySource.openlibrary.toLocaleString()}</div>
        </div>
      </div>
    </div>

    <div class="chart-section">
      <h2 class="chart-title">Multi-Edition Harvest Strategy</h2>
      <p style="color: var(--cf-text-dim); margin-bottom: 1rem;">
        Intelligent edition discovery maximizes ISBNdb API quota by caching 2-3 editions per Work.
      </p>
      <div class="source-breakdown">
        <div class="source-item">
          <div class="source-name">Phase 1: Edition Discovery</div>
          <div class="stat-subtitle"><span class="badge badge-success">\u2713 Active</span></div>
          <p style="color: var(--cf-text-dim); font-size: 0.85rem; margin-top: 0.5rem;">
            Google Books API integration with 100-point scoring algorithm
          </p>
        </div>
        <div class="source-item">
          <div class="source-name">Phase 2: Enhanced Harvest</div>
          <div class="stat-subtitle"><span class="badge badge-success">\u2713 Active</span></div>
          <p style="color: var(--cf-text-dim); font-size: 0.85rem; margin-top: 0.5rem;">
            350 Works \xD7 2-3 editions = 700-1050 ISBNs/day
          </p>
        </div>
        <div class="source-item">
          <div class="source-name">Analytics Integration</div>
          <div class="stat-subtitle"><span class="badge badge-warning">\u23F3 Pending 24h</span></div>
          <p style="color: var(--cf-text-dim); font-size: 0.85rem; margin-top: 0.5rem;">
            Popular search ISBNs from Analytics Engine
          </p>
        </div>
      </div>
    </div>

    <div class="footer">
      <p>Last updated: ${new Date(stats.lastUpdated).toLocaleString()}</p>
      <p class="refresh-note">Dashboard updates automatically on page load</p>
      <p style="margin-top: 1rem;">
        Powered by <a href="https://workers.cloudflare.com" target="_blank">Cloudflare Workers</a>
        \u2022 <a href="https://developers.cloudflare.com/r2/" target="_blank">R2 Object Storage</a>
        \u2022 <a href="https://developers.cloudflare.com/kv/" target="_blank">KV Cache</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}
__name(renderDashboard, "renderDashboard");
async function handleHarvestDashboard(request, env2) {
  try {
    const stats = await getHarvestStats(env2);
    const html = renderDashboard(stats);
    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=300",
        // 5 minute cache
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error3) {
    console.error("Dashboard error:", error3);
    return new Response("Dashboard temporarily unavailable", {
      status: 500,
      headers: { "Content-Type": "text/plain" }
    });
  }
}
__name(handleHarvestDashboard, "handleHarvestDashboard");

// src/handlers/v1/search-editions.ts
function levenshteinDistance2(str1, str2) {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix = [];
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        // deletion
        matrix[i][j - 1] + 1,
        // insertion
        matrix[i - 1][j - 1] + cost
        // substitution
      );
    }
  }
  return matrix[len1][len2];
}
__name(levenshteinDistance2, "levenshteinDistance");
function isTitleMatch(title1, title2) {
  const normalized1 = normalizeTitle(title1);
  const normalized2 = normalizeTitle(title2);
  if (normalized1 === normalized2) return true;
  if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) {
    return true;
  }
  const maxLen = Math.max(normalized1.length, normalized2.length);
  if (maxLen === 0) return false;
  const distance = levenshteinDistance2(normalized1, normalized2);
  const similarity = 1 - distance / maxLen;
  return similarity >= 0.7;
}
__name(isTitleMatch, "isTitleMatch");
function isbn10To13(isbn10) {
  if (isbn10.length !== 10) return isbn10;
  const base = "978" + isbn10.substring(0, 9);
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(base[i]);
    sum += digit * (i % 2 === 0 ? 1 : 3);
  }
  const checkDigit = (10 - sum % 10) % 10;
  return base + checkDigit;
}
__name(isbn10To13, "isbn10To13");
function normalizeISBNForDedup(isbn) {
  const cleaned = normalizeISBN(isbn);
  if (cleaned.length === 10) {
    return isbn10To13(cleaned);
  }
  return cleaned;
}
__name(normalizeISBNForDedup, "normalizeISBNForDedup");
function deduplicateEditions(editions) {
  const isbnMap = /* @__PURE__ */ new Map();
  for (const edition of editions) {
    const isbns = /* @__PURE__ */ new Set();
    if (edition.isbn) {
      isbns.add(normalizeISBNForDedup(edition.isbn));
    }
    for (const isbn of edition.isbns || []) {
      if (isbn) {
        isbns.add(normalizeISBNForDedup(isbn));
      }
    }
    let isDuplicate = false;
    for (const isbn of isbns) {
      if (isbnMap.has(isbn)) {
        isDuplicate = true;
        const existing = isbnMap.get(isbn);
        if (edition.isbndbQuality > existing.isbndbQuality) {
          isbnMap.set(isbn, edition);
        }
        break;
      }
    }
    if (!isDuplicate && isbns.size > 0) {
      const primaryISBN = Array.from(isbns)[0];
      isbnMap.set(primaryISBN, edition);
    }
  }
  return Array.from(isbnMap.values());
}
__name(deduplicateEditions, "deduplicateEditions");
function sortEditions(editions) {
  const formatPriority = {
    Hardcover: 1,
    Paperback: 2,
    "E-book": 3,
    Audiobook: 4,
    Other: 5
  };
  return editions.sort((a, b) => {
    const priorityA = formatPriority[a.format] || 5;
    const priorityB = formatPriority[b.format] || 5;
    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }
    if (a.isbndbQuality !== b.isbndbQuality) {
      return b.isbndbQuality - a.isbndbQuality;
    }
    const dateA = a.publicationDate || "0000";
    const dateB = b.publicationDate || "0000";
    return dateB.localeCompare(dateA);
  });
}
__name(sortEditions, "sortEditions");
async function handleSearchEditions(workTitle, author, limit = 20, env2, ctx, request = null) {
  const startTime = Date.now();
  if (!workTitle || workTitle.trim().length === 0) {
    return createErrorResponse(
      "workTitle parameter is required",
      400,
      ErrorCodes.INVALID_QUERY,
      { workTitle, author },
      request
    );
  }
  if (!author || author.trim().length === 0) {
    return createErrorResponse(
      "author parameter is required",
      400,
      ErrorCodes.INVALID_QUERY,
      { workTitle, author },
      request
    );
  }
  try {
    const normalizedTitle = normalizeTitle(workTitle);
    const normalizedAuthor = normalizeAuthor(author);
    const cacheKey = generateCacheKey("v1:editions", {
      title: normalizedTitle,
      author: normalizedAuthor
    });
    const cache = new UnifiedCacheService(env2, ctx);
    const cachedResult = await cache.get(cacheKey, "editions", {
      query: `${workTitle} by ${author}`
    });
    if (cachedResult?.data) {
      console.log(`\u2705 Cache HIT: /v1/editions/search (${cacheKey})`);
      return createSuccessResponse(
        cachedResult.data.data,
        {
          ...cachedResult.data.meta,
          cached: true,
          cacheSource: cachedResult.source
          // EDGE or KV
        },
        200,
        request
      );
    }
    console.log(
      `v1 editions search - workTitle: "${workTitle}" (normalized: "${normalizedTitle}"), author: "${author}" (normalized: "${normalizedAuthor}"), limit: ${limit}`
    );
    const isbndbResult = await getISBNdbEditionsForWork(
      workTitle.trim(),
      author.trim(),
      env2
    );
    const googleQuery = `intitle:"${workTitle.trim()}" inauthor:"${author.trim()}"`;
    const googleResult = await searchGoogleBooks(
      googleQuery,
      { maxResults: 40 },
      // Request more to account for filtering
      env2
    );
    let allEditions = [];
    if (isbndbResult && Array.isArray(isbndbResult)) {
      allEditions = allEditions.concat(isbndbResult);
    }
    if (googleResult && googleResult.editions) {
      allEditions = allEditions.concat(googleResult.editions);
    }
    const filteredEditions = allEditions.filter((edition) => {
      const titleMatches = edition.title && isTitleMatch(workTitle, edition.title);
      if (!titleMatches) return false;
      if (!edition.isbn && !edition.isbns?.length) {
        return false;
      }
      return true;
    });
    const uniqueEditions = deduplicateEditions(filteredEditions);
    const sortedEditions = sortEditions(uniqueEditions);
    if (sortedEditions.length === 0) {
      return createErrorResponse(
        `No editions found for "${workTitle}" by ${author}`,
        404,
        ErrorCodes.NOT_FOUND,
        { workTitle, author, processingTime: Date.now() - startTime },
        request
      );
    }
    const limitedEditions = sortedEditions.slice(0, limit);
    let provider = "none";
    if (limitedEditions.length > 0) {
      const providers = new Set(
        limitedEditions.map((e) => e.primaryProvider).filter(Boolean)
      );
      if (providers.size === 1) {
        provider = Array.from(providers)[0] || "unknown";
      } else if (providers.size > 1) {
        provider = "orchestrated:" + Array.from(providers).join("+");
      }
    }
    const responseData = {
      works: [],
      // Empty - not needed for editions endpoint
      editions: limitedEditions,
      authors: []
      // Empty - not needed for editions endpoint
    };
    const response = createSuccessResponse(
      responseData,
      {
        processingTime: Date.now() - startTime,
        provider,
        cached: false
      },
      200,
      request
    );
    const legacyResponseObject = {
      success: true,
      data: responseData,
      meta: {
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        processingTime: Date.now() - startTime,
        provider,
        cached: false
      }
    };
    const ttl = 7 * 24 * 60 * 60;
    ctx.waitUntil(setCached(cacheKey, legacyResponseObject, ttl, env2));
    console.log(
      `\u{1F4BE} Cache WRITE: /v1/editions/search (${cacheKey}, TTL: ${ttl}s)`
    );
    return response;
  } catch (error3) {
    console.error("Error in v1 editions search:", error3);
    if (error3.message?.includes("API") || error3.message?.includes("fetch")) {
      return createErrorResponse(
        "All book data providers failed",
        503,
        ErrorCodes.PROVIDER_ERROR,
        { error: error3.toString(), processingTime: Date.now() - startTime },
        request
      );
    }
    return createErrorResponse(
      error3.message || "Internal server error",
      500,
      ErrorCodes.INTERNAL_ERROR,
      { error: error3.toString(), processingTime: Date.now() - startTime },
      request
    );
  }
}
__name(handleSearchEditions, "handleSearchEditions");

// src/handlers/v1/scan-results.ts
async function handleScanResults(jobId, env2, request = null) {
  const startTime = Date.now();
  if (!jobId || jobId.trim().length === 0) {
    return createErrorResponse(
      "Job ID is required",
      400,
      ErrorCodes.INVALID_REQUEST,
      { jobId },
      request
    );
  }
  try {
    const resultsKey = `scan-results:${jobId}`;
    const kvResult = await env2.KV_CACHE.getWithMetadata(resultsKey, "json");
    if (!kvResult.value) {
      return createErrorResponse(
        "Scan results not found or expired. Results are stored for 24 hours after job completion.",
        404,
        ErrorCodes.NOT_FOUND,
        { jobId, resultsKey, ttl: "24 hours" },
        request
      );
    }
    const results = kvResult.value;
    const expiresAt = kvResult.metadata?.expiration ? new Date(kvResult.metadata.expiration * 1e3).toISOString() : new Date(Date.now() + 24 * 60 * 60 * 1e3).toISOString();
    console.log(
      `[v1/scan/results] Retrieved results for job ${jobId}: ${results.totalDetected} books detected, expires at ${expiresAt}`
    );
    return createSuccessResponse(
      {
        ...results,
        expiresAt
        // Add expiry timestamp to response
      },
      {
        processingTime: Date.now() - startTime,
        cached: true,
        provider: "kv_cache"
      },
      200,
      request
    );
  } catch (error3) {
    console.error("[v1/scan/results] Error retrieving scan results:", error3);
    return createErrorResponse(
      error3.message || "Failed to retrieve scan results",
      500,
      ErrorCodes.INTERNAL_ERROR,
      { jobId, error: error3.toString() },
      request
    );
  }
}
__name(handleScanResults, "handleScanResults");

// src/handlers/v1/csv-results.ts
async function handleCSVResults(jobId, env2, request = null) {
  const startTime = Date.now();
  if (!jobId || jobId.trim().length === 0) {
    return createErrorResponse(
      "Job ID is required",
      400,
      ErrorCodes.INVALID_REQUEST,
      { jobId },
      request
    );
  }
  try {
    const resultsKey = `csv-results:${jobId}`;
    const kvResult = await env2.KV_CACHE.getWithMetadata(resultsKey, "json");
    if (!kvResult.value) {
      return createErrorResponse(
        "CSV import results not found or expired. Results are stored for 24 hours after job completion.",
        404,
        ErrorCodes.NOT_FOUND,
        { jobId, resultsKey, ttl: "24 hours" },
        request
      );
    }
    const results = kvResult.value;
    const expiresAt = kvResult.metadata?.expiration ? new Date(kvResult.metadata.expiration * 1e3).toISOString() : new Date(Date.now() + 24 * 60 * 60 * 1e3).toISOString();
    console.log(
      `[v1/csv/results] Retrieved results for job ${jobId}: ${results.books.length} books imported, expires at ${expiresAt}`
    );
    return createSuccessResponse(
      {
        ...results,
        expiresAt
        // Add expiry timestamp to response
      },
      {
        processingTime: Date.now() - startTime,
        cached: true,
        provider: "kv_cache"
      },
      200,
      request
    );
  } catch (error3) {
    console.error("[v1/csv/results] Error retrieving CSV results:", error3);
    return createErrorResponse(
      error3.message || "Failed to retrieve CSV import results",
      500,
      ErrorCodes.INTERNAL_ERROR,
      { jobId, error: error3.toString() },
      request
    );
  }
}
__name(handleCSVResults, "handleCSVResults");

// src/handlers/image-proxy.ts
async function handleImageProxy(request, env2) {
  const url = new URL(request.url);
  const imageUrl = url.searchParams.get("url");
  const size = url.searchParams.get("size") || "medium";
  if (!imageUrl) {
    return new Response("Missing url parameter", { status: 400 });
  }
  const allowedDomains = /* @__PURE__ */ new Set([
    "books.google.com",
    "covers.openlibrary.org",
    "images-na.ssl-images-amazon.com"
  ]);
  try {
    const parsedUrl = new URL(imageUrl);
    if (!allowedDomains.has(parsedUrl.hostname)) {
      return new Response("Domain not allowed", { status: 403 });
    }
  } catch {
    return new Response("Invalid URL", { status: 400 });
  }
  const normalizedUrl = normalizeImageURL(imageUrl);
  const cacheKey = `covers/${await hashURL(normalizedUrl)}`;
  const cached = await env2.BOOK_COVERS.get(cacheKey);
  if (cached) {
    try {
      console.log(`Image cache HIT: ${cacheKey}`);
      const imageData2 = await cached.arrayBuffer();
      const contentType2 = cached.httpMetadata?.contentType || "image/jpeg";
      return resizeImage(imageData2, size, contentType2);
    } catch (err) {
      console.error(
        `Error reading cached image from R2 for key ${cacheKey}:`,
        err
      );
    }
  }
  console.log(`Image cache MISS: ${cacheKey}`);
  const origin = await fetch(normalizedUrl, {
    headers: { "User-Agent": "BooksTrack/3.0 (book-cover-proxy)" }
  });
  if (!origin.ok) {
    console.error(`Failed to fetch image from origin: ${origin.status}`);
    return new Response("Failed to fetch image", { status: 502 });
  }
  const imageData = await origin.arrayBuffer();
  const contentType = origin.headers.get("content-type") || "image/jpeg";
  const originalSize = imageData.byteLength;
  let compressedData = imageData;
  let finalContentType = contentType;
  if (contentType.includes("jpeg") || contentType.includes("png")) {
    try {
      const compressed = await compressToWebP2(imageData, 85);
      if (compressed && compressed.byteLength < originalSize) {
        compressedData = compressed;
        finalContentType = "image/webp";
        const savings = Math.round(
          (originalSize - compressed.byteLength) / originalSize * 100
        );
        console.log(
          `Compressed ${originalSize} \u2192 ${compressed.byteLength} bytes (${savings}% savings)`
        );
      }
    } catch (error3) {
      console.error("WebP compression failed, storing original:", error3);
    }
  }
  await env2.BOOK_COVERS.put(cacheKey, compressedData, {
    httpMetadata: { contentType: finalContentType },
    customMetadata: {
      originalSize: originalSize.toString(),
      compressedSize: compressedData.byteLength.toString(),
      compressionRatio: (compressedData.byteLength / originalSize).toFixed(2)
    }
  });
  console.log(`Stored in R2: ${cacheKey} (${compressedData.byteLength} bytes)`);
  return resizeImage(imageData, size, contentType);
}
__name(handleImageProxy, "handleImageProxy");
async function hashURL(url) {
  const encoder = new TextEncoder();
  const data = encoder.encode(url);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(hashURL, "hashURL");
async function compressToWebP2(imageData, quality) {
  try {
    const imageResponse = new Response(imageData, {
      headers: {
        "Content-Type": "image/jpeg",
        // Cloudflare will convert from this
        "CF-Image-Format": "webp",
        "CF-Image-Quality": quality.toString()
      }
    });
    const transformed = await fetch(imageResponse.url, {
      cf: {
        image: {
          format: "webp",
          quality
        }
      }
    });
    if (!transformed.ok) {
      return null;
    }
    return await transformed.arrayBuffer();
  } catch (error3) {
    console.error("WebP compression error:", error3);
    return null;
  }
}
__name(compressToWebP2, "compressToWebP");
function resizeImage(imageData, size, contentType) {
  const SIZE_MAP = {
    small: { width: 128, height: 192 },
    medium: { width: 256, height: 384 },
    large: { width: 512, height: 768 }
  };
  const dimensions = SIZE_MAP[size] || SIZE_MAP.medium;
  return new Response(imageData, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=2592000, immutable",
      // 30 days
      "CF-Image-Width": dimensions.width.toString(),
      "CF-Image-Height": dimensions.height.toString(),
      "CF-Image-Fit": "scale-down"
    }
  });
}
__name(resizeImage, "resizeImage");

// src/handlers/warming-upload.js
async function handleWarmingUpload(request, env2, ctx) {
  try {
    const body = await request.json();
    if (!body.csv) {
      return new Response(
        JSON.stringify({
          error: "Missing required field: csv (base64-encoded CSV file)"
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
    const maxDepth = body.maxDepth || 2;
    if (maxDepth < 1 || maxDepth > 3) {
      return new Response(
        JSON.stringify({
          error: "maxDepth must be 1-3"
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
    const csvText = atob(body.csv);
    const prompt = buildCSVParserPrompt();
    const apiKey = env2.GEMINI_API_KEY?.get ? await env2.GEMINI_API_KEY.get() : env2.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error: "GEMINI_API_KEY not configured"
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
    const books = await parseCSVWithGemini(csvText, prompt, apiKey);
    const authorsSet = /* @__PURE__ */ new Set();
    for (const book of books) {
      if (book.author) {
        authorsSet.add(book.author.trim());
      }
    }
    const uniqueAuthors = Array.from(authorsSet);
    const jobId = crypto.randomUUID();
    for (const author of uniqueAuthors) {
      await env2.AUTHOR_WARMING_QUEUE.send({
        author,
        source: "csv",
        depth: 0,
        queuedAt: (/* @__PURE__ */ new Date()).toISOString(),
        jobId
      });
    }
    await env2.CACHE.put(
      `warming:job:${jobId}`,
      JSON.stringify({
        authorsQueued: uniqueAuthors.length,
        maxDepth,
        startedAt: Date.now(),
        status: "queued"
      }),
      {
        expirationTtl: 7 * 24 * 60 * 60
        // 7 days
      }
    );
    return new Response(
      JSON.stringify({
        jobId,
        authorsQueued: uniqueAuthors.length,
        estimatedWorks: uniqueAuthors.length * 15,
        estimatedDuration: "2-4 hours"
      }),
      {
        status: 202,
        headers: { "Content-Type": "application/json" }
      }
    );
  } catch (error3) {
    return new Response(
      JSON.stringify({
        error: "Failed to process upload",
        message: error3.message
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
}
__name(handleWarmingUpload, "handleWarmingUpload");

// src/handlers/dlq-monitor.js
async function handleDLQMonitor(request, env2) {
  try {
    return new Response(
      JSON.stringify({
        queue: "author-warming-dlq",
        depth: 0,
        message: "DLQ monitoring requires Wrangler API integration",
        howToCheck: "Run: npx wrangler queues consumer list author-warming-dlq"
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );
  } catch (error3) {
    return new Response(
      JSON.stringify({
        error: "Failed to check DLQ",
        message: error3.message
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
}
__name(handleDLQMonitor, "handleDLQMonitor");

// src/middleware/size-validator.js
function validateResourceSize(request, maxSizeMB, resourceType = "file") {
  const contentLength = parseInt(request.headers.get("Content-Length") || "0");
  const maxBytes = maxSizeMB * 1024 * 1024;
  if (contentLength > maxBytes) {
    const receivedMB = (contentLength / 1024 / 1024).toFixed(2);
    console.warn(
      `[Size Validator] Rejected ${resourceType}: ${receivedMB}MB exceeds ${maxSizeMB}MB limit`
    );
    return new Response(
      JSON.stringify({
        error: `${resourceType.charAt(0).toUpperCase() + resourceType.slice(1)} too large. Maximum ${maxSizeMB}MB allowed.`,
        code: "FILE_TOO_LARGE",
        resourceType,
        details: {
          receivedMB: parseFloat(receivedMB),
          maxMB: maxSizeMB,
          receivedBytes: contentLength,
          maxBytes
        }
      }),
      {
        status: 413,
        headers: {
          "Content-Type": "application/json",
          "X-Max-Size-MB": maxSizeMB.toString(),
          "X-Received-Size-MB": receivedMB,
          "X-Resource-Type": resourceType
        }
      }
    );
  }
  return null;
}
__name(validateResourceSize, "validateResourceSize");

// src/index.js
var index_default = {
  async fetch(request, env2, ctx) {
    const useHono = env2.ENABLE_HONO_ROUTER !== "false";
    if (useHono) {
      console.log("[Router] Using Hono router (default, feature flag enabled)");
      return router_default.fetch(request, env2, ctx);
    }
    console.log(
      "[Router] Using manual router (feature flag explicitly disabled)"
    );
    const startTime = Date.now();
    const url = new URL(request.url);
    let response;
    let cacheStatus = "MISS";
    let errorCode = null;
    try {
      if (url.hostname === "harvest.oooefam.net" && url.pathname === "/") {
        response = await handleHarvestDashboard(request, env2);
        return addAnalyticsHeaders(response, startTime, cacheStatus, errorCode);
      }
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: getCorsHeaders(request)
        });
      }
      if (url.pathname === "/ws/progress") {
        const jobId = url.searchParams.get("jobId");
        if (!jobId) {
          return errorResponse(
            "MISSING_PARAM",
            "Missing jobId parameter",
            400,
            null
          );
        }
        const doStub = getProgressDOStub(jobId, env2);
        return doStub.fetch(request);
      }
      if (url.pathname === "/api/token/refresh" && request.method === "POST") {
        const rateLimitResponse = await checkRateLimit(request, env2);
        if (rateLimitResponse) return rateLimitResponse;
        try {
          const { jobId, oldToken } = await request.json();
          if (!jobId || !oldToken) {
            return errorResponse(
              "INVALID_REQUEST",
              "Invalid request: jobId and oldToken required",
              400,
              request
            );
          }
          const doStub = getProgressDOStub(jobId, env2);
          const result = await doStub.refreshAuthToken(oldToken);
          if (result.error) {
            return errorResponse("AUTH_ERROR", result.error, 401, request);
          }
          return jsonResponse(
            {
              jobId,
              token: result.token,
              expiresIn: result.expiresIn
            },
            200,
            request
          );
        } catch (error3) {
          console.error("Failed to refresh token:", error3);
          return errorResponse(
            "INTERNAL_ERROR",
            `Failed to refresh token: ${error3.message}`,
            500,
            request
          );
        }
      }
      if (url.pathname.startsWith("/api/job-state/") && request.method === "GET") {
        try {
          const jobId = url.pathname.split("/").pop();
          if (!jobId) {
            return errorResponse(
              "INVALID_REQUEST",
              "Invalid request: jobId required",
              400,
              request
            );
          }
          const authHeader = request.headers.get("Authorization");
          const providedToken = authHeader?.replace("Bearer ", "");
          if (!providedToken) {
            return errorResponse(
              "AUTH_ERROR",
              "Missing authorization token",
              401,
              request
            );
          }
          const doStub = getProgressDOStub(jobId, env2);
          const result = await doStub.getJobStateAndAuth();
          if (!result) {
            return notFoundResponse(
              "Job not found or state not initialized",
              request
            );
          }
          const { jobState, authToken, authTokenExpiration } = result;
          if (!authToken || providedToken !== authToken || Date.now() > authTokenExpiration) {
            return errorResponse(
              "AUTH_ERROR",
              "Invalid or expired token",
              401,
              request
            );
          }
          return jsonResponse(jobState, 200, request);
        } catch (error3) {
          console.error("Failed to get job state:", error3);
          return errorResponse(
            "INTERNAL_ERROR",
            `Failed to get job state: ${error3.message}`,
            500,
            request
          );
        }
      }
      if (url.pathname === "/api/enrichment/start" && request.method === "POST") {
        console.warn(
          "[DEPRECATED] /api/enrichment/start called. iOS should migrate to /v1/enrichment/batch"
        );
        const rateLimitResponse = await checkRateLimit(request, env2);
        if (rateLimitResponse) return rateLimitResponse;
        try {
          const { jobId, workIds } = await request.json();
          if (!jobId || !workIds || !Array.isArray(workIds)) {
            return errorResponse(
              "INVALID_REQUEST",
              "Invalid request: jobId and workIds (array) required",
              400,
              null
            );
          }
          if (workIds.length === 0) {
            return errorResponse(
              "INVALID_REQUEST",
              "Invalid request: workIds array cannot be empty",
              400,
              null
            );
          }
          const books = workIds.map((id) => ({ title: String(id) }));
          const modifiedRequest = new Request(request, {
            body: JSON.stringify({ books, jobId })
          });
          const response2 = await handleBatchEnrichment(
            modifiedRequest,
            env2,
            ctx
          );
          response2.headers.set("Deprecation", "true");
          response2.headers.set("Sunset", "Sat, 1 Mar 2026 00:00:00 GMT");
          response2.headers.set(
            "Warning",
            '299 - "This endpoint is deprecated. Use /v1/enrichment/batch instead. Sunset: March 1, 2026"'
          );
          response2.headers.set(
            "Link",
            '<https://api.oooefam.net/v1/enrichment/batch>; rel="alternate"; title="Use /v1/enrichment/batch instead"'
          );
          return response2;
        } catch (error3) {
          console.error("Failed to start enrichment:", error3);
          return errorResponse(
            "INTERNAL_ERROR",
            `Failed to start enrichment: ${error3.message}`,
            500,
            null
          );
        }
      }
      if (url.pathname === "/api/enrichment/cancel" && request.method === "POST") {
        try {
          const { jobId } = await request.json();
          if (!jobId) {
            return errorResponse(
              "INVALID_REQUEST",
              "Invalid request: jobId required",
              400,
              null
            );
          }
          const doStub = getProgressDOStub(jobId, env2);
          const result = await doStub.cancelJob(
            "Canceled by iOS client during library reset"
          );
          return jsonResponse(
            {
              jobId,
              status: "canceled",
              message: "Enrichment job canceled successfully"
            },
            200,
            request
          );
        } catch (error3) {
          console.error("Failed to cancel enrichment:", error3);
          return errorResponse(
            "INTERNAL_ERROR",
            `Failed to cancel enrichment: ${error3.message}`,
            500,
            null
          );
        }
      }
      if (url.pathname === "/api/batch-scan" && request.method === "POST") {
        const rateLimitResponse = await checkRateLimit(request, env2);
        if (rateLimitResponse) return rateLimitResponse;
        return handleBatchScan(request, env2, ctx);
      }
      if (url.pathname === "/api/scan-bookshelf/batch" && request.method === "POST") {
        const rateLimitResponse = await checkRateLimit(request, env2);
        if (rateLimitResponse) return rateLimitResponse;
        return handleBatchScan(request, env2, ctx);
      }
      if (url.pathname === "/api/scan-bookshelf/cancel" && request.method === "POST") {
        try {
          const { jobId } = await request.json();
          if (!jobId) {
            return errorResponse("MISSING_PARAM", "jobId required", 400, null);
          }
          const doStub = getProgressDOStub(jobId, env2);
          const result = await doStub.cancelBatch();
          return jsonResponse(result, 200, request);
        } catch (error3) {
          console.error("Cancel batch error:", error3);
          return errorResponse(
            "INTERNAL_ERROR",
            "Failed to cancel batch",
            500,
            null
          );
        }
      }
      if (url.pathname === "/api/import/csv-gemini" && request.method === "POST") {
        const rateLimitResponse = await checkRateLimit(request, env2);
        if (rateLimitResponse) return rateLimitResponse;
        const sizeCheck = validateResourceSize(request, 10, "CSV file");
        if (sizeCheck) return sizeCheck;
        return handleCSVImport(request, env2, ctx);
      }
      if (url.pathname === "/api/warming/upload" && request.method === "POST") {
        return handleWarmingUpload(request, env2, ctx);
      }
      if (url.pathname === "/api/warming/dlq" && request.method === "GET") {
        return handleDLQMonitor(request, env2);
      }
      if (url.pathname === "/v1/enrichment/batch" && request.method === "POST") {
        const rateLimitResponse = await checkRateLimit(request, env2);
        if (rateLimitResponse) return rateLimitResponse;
        return handleBatchEnrichment(request, env2, ctx);
      }
      if (url.pathname === "/api/scan-bookshelf" && request.method === "POST") {
        const rateLimitResponse = await checkRateLimit(request, env2);
        if (rateLimitResponse) return rateLimitResponse;
        const sizeCheck = validateResourceSize(request, 5, "image");
        if (sizeCheck) return sizeCheck;
        try {
          const jobId = url.searchParams.get("jobId") || crypto.randomUUID();
          console.log(
            `[Diagnostic Layer 1: Main Router] === Incoming Request Headers for job ${jobId} ===`
          );
          const aiProviderHeader = request.headers.get("X-AI-Provider");
          console.log(
            `[Diagnostic Layer 1: Main Router] X-AI-Provider header: ${aiProviderHeader ? aiProviderHeader : "NOT FOUND"}`
          );
          console.log(
            `[Diagnostic Layer 1: Main Router] All headers:`,
            Object.fromEntries(request.headers.entries())
          );
          const contentType = request.headers.get("content-type") || "";
          if (!contentType.startsWith("image/")) {
            return errorResponse(
              "INVALID_REQUEST",
              "Invalid content type: image/* required",
              400,
              null
            );
          }
          const imageData = await request.arrayBuffer();
          const doStub = getProgressDOStub(jobId, env2);
          const authToken = crypto.randomUUID();
          await doStub.setAuthToken(authToken);
          console.log(`[API] Auth token generated for scan job ${jobId}`);
          console.log(
            `[API] Waiting for WebSocket ready signal for job ${jobId}`
          );
          const readyResult = await doStub.waitForReady(5e3);
          if (readyResult.timedOut || readyResult.disconnected) {
            const reason = readyResult.timedOut ? "timeout" : "WebSocket not connected";
            console.warn(
              `[API] WebSocket ready ${reason} for job ${jobId}, proceeding anyway (client may miss early updates)`
            );
            console.log(
              `[Analytics] websocket_ready_timeout - job_id: ${jobId}, reason: ${reason}, client_ip: ${request.headers.get("CF-Connecting-IP")}`
            );
          } else {
            console.log(
              `[API] \u2705 WebSocket ready for job ${jobId}, starting processing`
            );
          }
          const requestHeaders = {
            "X-AI-Provider": request.headers.get("X-AI-Provider"),
            "CF-Connecting-IP": request.headers.get("CF-Connecting-IP")
          };
          await doStub.scheduleBookshelfScan(imageData, jobId, requestHeaders);
          console.log(
            `[API] Bookshelf scan scheduled via alarm for job ${jobId}`
          );
          const stages = [
            {
              name: "Image Quality Analysis",
              typicalDuration: 3,
              progress: 0.1
            },
            { name: "AI Processing", typicalDuration: 25, progress: 0.5 },
            { name: "Metadata Enrichment", typicalDuration: 12, progress: 1 }
          ];
          const totalDuration = stages.reduce(
            (sum, stage) => sum + stage.typicalDuration,
            0
          );
          const estimatedRange = [
            Math.floor(totalDuration * 0.8),
            Math.ceil(totalDuration * 1.2)
          ];
          return acceptedResponse(
            {
              jobId,
              token: authToken,
              // NEW: Token for WebSocket authentication
              status: "started",
              websocketReady: readyResult.success,
              // NEW: Indicates if WebSocket is ready
              message: "AI scan started. Connect to /ws/progress?jobId=" + jobId + " for real-time updates.",
              stages,
              estimatedRange
            },
            request
          );
        } catch (error3) {
          console.error("Failed to start AI scan:", error3);
          return errorResponse(
            "INTERNAL_ERROR",
            `Failed to start AI scan: ${error3.message}`,
            500,
            null
          );
        }
      }
      if (url.pathname === "/api/cache/metrics" && request.method === "GET") {
        return handleCacheMetrics(request, env2);
      }
      if (url.pathname === "/metrics" && request.method === "GET") {
        return handleMetricsRequest(request, env2, ctx);
      }
      if (url.pathname === "/v1/search/title" && request.method === "GET") {
        const query = url.searchParams.get("q");
        return await handleSearchTitle(query, env2, request);
      }
      if (url.pathname === "/v1/search/isbn" && request.method === "GET") {
        const isbn = url.searchParams.get("isbn");
        return await handleSearchISBN(isbn, env2, request);
      }
      if (url.pathname === "/v1/search/advanced" && request.method === "GET") {
        const title2 = url.searchParams.get("title") || "";
        const author = url.searchParams.get("author") || "";
        return await handleSearchAdvanced(title2, author, env2, ctx, request);
      }
      if (url.pathname === "/v1/editions/search" && request.method === "GET") {
        const workTitle = url.searchParams.get("workTitle") || "";
        const author = url.searchParams.get("author") || "";
        const limit = parseInt(url.searchParams.get("limit") || "20");
        return await handleSearchEditions(
          workTitle,
          author,
          limit,
          env2,
          ctx,
          request
        );
      }
      if (url.pathname.startsWith("/v1/scan/results/") && request.method === "GET") {
        const jobId = url.pathname.split("/").pop();
        return await handleScanResults(jobId, env2, request);
      }
      if (url.pathname.startsWith("/v1/csv/results/") && request.method === "GET") {
        const jobId = url.pathname.split("/").pop();
        return await handleCSVResults(jobId, env2, request);
      }
      if (url.pathname === "/images/proxy" && request.method === "GET") {
        return handleImageProxy(request, env2);
      }
      if (url.pathname === "/search/title") {
        const query = url.searchParams.get("q");
        if (!query) {
          return errorResponse(
            "MISSING_PARAM",
            'Missing query parameter "q"',
            400,
            null
          );
        }
        const maxResults = parseInt(url.searchParams.get("maxResults") || "20");
        const result = await searchByTitle(
          query,
          { maxResults },
          env2,
          ctx
        );
        const cacheHeaders = result._cacheHeaders || {};
        delete result._cacheHeaders;
        const response2 = jsonResponse(result, 200, request);
        Object.entries(cacheHeaders).forEach(([key, value]) => {
          response2.headers.set(key, value);
        });
        response2.headers.set("Deprecation", "true");
        response2.headers.set("Sunset", "Sat, 1 Mar 2026 00:00:00 GMT");
        response2.headers.set(
          "Warning",
          '299 - "This endpoint is deprecated. Use /v1/search/title instead. Sunset: March 1, 2026"'
        );
        response2.headers.set(
          "Link",
          '<https://api.oooefam.net/v1/search/title>; rel="alternate"; title="Use /v1/search/title instead"'
        );
        return response2;
      }
      if (url.pathname === "/search/isbn") {
        const isbn = url.searchParams.get("isbn");
        if (!isbn) {
          return errorResponse(
            "MISSING_PARAM",
            "Missing ISBN parameter",
            400,
            null
          );
        }
        const maxResults = parseInt(url.searchParams.get("maxResults") || "1");
        const result = await searchByISBN2(
          isbn,
          { maxResults },
          env2,
          ctx
        );
        const cacheHeaders = result._cacheHeaders || {};
        delete result._cacheHeaders;
        const response2 = jsonResponse(result, 200, request);
        Object.entries(cacheHeaders).forEach(([key, value]) => {
          response2.headers.set(key, value);
        });
        response2.headers.set("Deprecation", "true");
        response2.headers.set("Sunset", "Sat, 1 Mar 2026 00:00:00 GMT");
        response2.headers.set(
          "Warning",
          '299 - "This endpoint is deprecated. Use /v1/search/isbn instead. Sunset: March 1, 2026"'
        );
        response2.headers.set(
          "Link",
          '<https://api.oooefam.net/v1/search/isbn>; rel="alternate"; title="Use /v1/search/isbn instead"'
        );
        return response2;
      }
      if (url.pathname === "/search/author") {
        const authorName = url.searchParams.get("q");
        if (!authorName) {
          return errorResponse(
            "MISSING_PARAM",
            'Missing query parameter "q"',
            400,
            null
          );
        }
        const limitParam = url.searchParams.get("limit") || url.searchParams.get("maxResults") || "50";
        const limit = parseInt(limitParam);
        const offset = parseInt(url.searchParams.get("offset") || "0");
        const sortBy = url.searchParams.get("sortBy") || "publicationYear";
        if (limit < 1 || limit > 100) {
          return errorResponse(
            "INVALID_PARAM",
            "Limit must be between 1 and 100",
            400,
            null
          );
        }
        if (offset < 0) {
          return errorResponse(
            "INVALID_PARAM",
            "Offset must be >= 0",
            400,
            null
          );
        }
        const validSortOptions = [
          "publicationYear",
          "publicationYearAsc",
          "title",
          "popularity"
        ];
        if (!validSortOptions.includes(sortBy)) {
          return errorResponse(
            "INVALID_PARAM",
            `sortBy must be one of: ${validSortOptions.join(", ")}`,
            400,
            null
          );
        }
        const result = await searchByAuthor(
          authorName,
          { limit, offset, sortBy },
          env2,
          ctx
        );
        const cacheStatus2 = result.cached ? "HIT" : "MISS";
        const cacheSource = result.cacheSource || "NONE";
        const response2 = jsonResponse(result, 200, request);
        response2.headers.set("Cache-Control", "public, max-age=21600");
        response2.headers.set("X-Cache", cacheStatus2);
        response2.headers.set("X-Cache-Source", cacheSource);
        response2.headers.set("X-Provider", result.provider || "openlibrary");
        response2.headers.set("Deprecation", "true");
        response2.headers.set("Sunset", "Sat, 1 Mar 2026 00:00:00 GMT");
        response2.headers.set(
          "Warning",
          '299 - "This endpoint is deprecated. Use /v1/search/advanced instead. Sunset: March 1, 2026"'
        );
        response2.headers.set(
          "Link",
          '<https://api.oooefam.net/v1/search/advanced>; rel="alternate"; title="Use /v1/search/advanced instead"'
        );
        return response2;
      }
      if (url.pathname === "/search/advanced") {
        try {
          let bookTitle, authorName, maxResults;
          if (request.method === "GET") {
            bookTitle = url.searchParams.get("title") || url.searchParams.get("bookTitle");
            authorName = url.searchParams.get("author") || url.searchParams.get("authorName");
            maxResults = parseInt(
              url.searchParams.get("maxResults") || "20",
              10
            );
          } else if (request.method === "POST") {
            const searchParams = await request.json();
            bookTitle = searchParams.title || searchParams.bookTitle;
            authorName = searchParams.author || searchParams.authorName;
            maxResults = searchParams.maxResults || 20;
          } else {
            return errorResponse(
              "METHOD_NOT_ALLOWED",
              "Use GET with query parameters or POST with JSON body",
              405,
              null,
              { Allow: "GET, POST" }
            );
          }
          if (!bookTitle && !authorName) {
            return errorResponse(
              "MISSING_PARAM",
              "At least one search parameter required (title or author)",
              400,
              null
            );
          }
          const result = await handleAdvancedSearch(
            { bookTitle, authorName },
            { maxResults },
            env2
          );
          const response2 = jsonResponse(result, 200, request);
          if (request.method === "GET") {
            response2.headers.set("Cache-Control", "public, max-age=21600");
          }
          response2.headers.set("Deprecation", "true");
          response2.headers.set("Sunset", "Sat, 1 Mar 2026 00:00:00 GMT");
          response2.headers.set(
            "Warning",
            '299 - "This endpoint is deprecated. Use /v1/search/advanced instead. Sunset: March 1, 2026"'
          );
          response2.headers.set(
            "Link",
            '<https://api.oooefam.net/v1/search/advanced>; rel="alternate"; title="Use /v1/search/advanced instead"'
          );
          return response2;
        } catch (error3) {
          console.error("Advanced search failed:", error3);
          return errorResponse(
            "INTERNAL_ERROR",
            `Advanced search failed: ${error3.message}`,
            500,
            null
          );
        }
      }
      if (url.pathname === "/external/google-books") {
        const query = url.searchParams.get("q");
        if (!query) {
          return errorResponse(
            "MISSING_PARAM",
            "Missing query parameter",
            400,
            null
          );
        }
        const maxResults = parseInt(url.searchParams.get("maxResults") || "20");
        const result = await searchGoogleBooks(
          query,
          { maxResults },
          env2
        );
        return jsonResponse(result, 200, null);
      }
      if (url.pathname === "/external/google-books-isbn") {
        const isbn = url.searchParams.get("isbn");
        if (!isbn) {
          return errorResponse(
            "MISSING_PARAM",
            "Missing isbn parameter",
            400,
            null
          );
        }
        const result = await searchGoogleBooksByISBN(isbn, env2);
        return jsonResponse(result, 200, null);
      }
      if (url.pathname === "/external/openlibrary") {
        const query = url.searchParams.get("q");
        if (!query) {
          return errorResponse(
            "MISSING_PARAM",
            "Missing query parameter",
            400,
            null
          );
        }
        const maxResults = parseInt(url.searchParams.get("maxResults") || "20");
        const result = await searchOpenLibrary(
          query,
          { maxResults },
          env2
        );
        return jsonResponse(result, 200, null);
      }
      if (url.pathname === "/external/openlibrary-author") {
        const author = url.searchParams.get("author");
        if (!author) {
          return errorResponse(
            "MISSING_PARAM",
            "Missing author parameter",
            400,
            null
          );
        }
        const result = await getOpenLibraryAuthorWorks(
          author,
          env2
        );
        return jsonResponse(result, 200, null);
      }
      if (url.pathname === "/external/isbndb") {
        const title2 = url.searchParams.get("title");
        if (!title2) {
          return errorResponse(
            "MISSING_PARAM",
            "Missing title parameter",
            400,
            null
          );
        }
        const author = url.searchParams.get("author") || "";
        const result = await searchISBNdb(title2, author, env2);
        return jsonResponse(result, 200, null);
      }
      if (url.pathname === "/external/isbndb-editions") {
        const title2 = url.searchParams.get("title");
        const author = url.searchParams.get("author");
        if (!title2 || !author) {
          return errorResponse(
            "MISSING_PARAM",
            "Missing title or author parameter",
            400,
            null
          );
        }
        const result = await getISBNdbEditionsForWork(
          title2,
          author,
          env2
        );
        return jsonResponse(result, 200, null);
      }
      if (url.pathname === "/external/isbndb-isbn") {
        const isbn = url.searchParams.get("isbn");
        if (!isbn) {
          return errorResponse(
            "MISSING_PARAM",
            "Missing isbn parameter",
            400,
            null
          );
        }
        const result = await getISBNdbBookByISBN(isbn, env2);
        return jsonResponse(result, 200, null);
      }
      if (url.pathname === "/test/do/init-batch" && request.method === "POST") {
        try {
          const { jobId, totalPhotos, status } = await request.json();
          const doStub = getProgressDOStub(jobId, env2);
          const result = await doStub.initBatch({ jobId, totalPhotos, status });
          return jsonResponse(result, 200, request);
        } catch (error3) {
          console.error("Test init-batch failed:", error3);
          return errorResponse("INTERNAL_ERROR", error3.message, 500, null);
        }
      }
      if (url.pathname === "/test/do/get-state" && request.method === "GET") {
        try {
          const jobId = url.searchParams.get("jobId");
          if (!jobId) {
            return errorResponse(
              "MISSING_PARAM",
              "Missing jobId parameter",
              400,
              null
            );
          }
          const doStub = getProgressDOStub(jobId, env2);
          const state = await doStub.getState();
          if (!state || Object.keys(state).length === 0) {
            return notFoundResponse("Job not found", null);
          }
          return jsonResponse(state, 200, request);
        } catch (error3) {
          console.error("Test get-state failed:", error3);
          return errorResponse("INTERNAL_ERROR", error3.message, 500, null);
        }
      }
      if (url.pathname === "/test/do/update-photo" && request.method === "POST") {
        try {
          const {
            jobId,
            photoIndex,
            status,
            booksFound,
            error: photoError
          } = await request.json();
          const doStub = getProgressDOStub(jobId, env2);
          const result = await doStub.updatePhoto({
            photoIndex,
            status,
            booksFound,
            error: photoError
          });
          if (result.error) {
            return notFoundResponse(result.error, request);
          }
          return jsonResponse(result, 200, request);
        } catch (error3) {
          console.error("Test update-photo failed:", error3);
          return errorResponse("INTERNAL_ERROR", error3.message, 500, null);
        }
      }
      if (url.pathname === "/test/do/complete-batch" && request.method === "POST") {
        try {
          const { jobId, status, totalBooks, photoResults, books } = await request.json();
          const doStub = getProgressDOStub(jobId, env2);
          const result = await doStub.completeBatch({
            status,
            totalBooks,
            photoResults,
            books
          });
          return jsonResponse(result, 200, request);
        } catch (error3) {
          console.error("Test complete-batch failed:", error3);
          return errorResponse("INTERNAL_ERROR", error3.message, 500, null);
        }
      }
      if (url.pathname === "/test/do/is-canceled" && request.method === "GET") {
        try {
          const jobId = url.searchParams.get("jobId");
          if (!jobId) {
            return errorResponse(
              "MISSING_PARAM",
              "Missing jobId parameter",
              400,
              null
            );
          }
          const doStub = getProgressDOStub(jobId, env2);
          const result = await doStub.isBatchCanceled();
          return jsonResponse(result, 200, request);
        } catch (error3) {
          console.error("Test is-canceled failed:", error3);
          return errorResponse("INTERNAL_ERROR", error3.message, 500, null);
        }
      }
      if (url.pathname === "/test/do/cancel-batch" && request.method === "POST") {
        try {
          const { jobId } = await request.json();
          const doStub = getProgressDOStub(jobId, env2);
          const result = await doStub.cancelBatch();
          return jsonResponse(result, 200, request);
        } catch (error3) {
          console.error("Test cancel-batch failed:", error3);
          return errorResponse("INTERNAL_ERROR", error3.message, 500, null);
        }
      }
      if (url.pathname === "/health") {
        return jsonResponse(
          {
            status: "ok",
            worker: "api-worker",
            version: "2.1.0",
            endpoints: [
              "GET /search/title?q={query}&maxResults={n} - Title search with caching (6h TTL)",
              "GET /search/isbn?isbn={isbn}&maxResults={n} - ISBN search with caching (7 day TTL)",
              "GET /search/author?q={author}&limit={n}&offset={n}&sortBy={sort} - Author bibliography (6h TTL)",
              "GET /search/advanced?title={title}&author={author} - Advanced search (primary method, 6h cache)",
              "POST /search/advanced - Advanced search (legacy support, JSON body)",
              "POST /api/enrichment/start - Start batch enrichment job",
              "POST /api/enrichment/cancel - Cancel in-flight enrichment job (body: {jobId})",
              "POST /api/scan-bookshelf?jobId={id} - AI bookshelf scanner (upload image with Content-Type: image/*)",
              "POST /api/scan-bookshelf/batch - Batch AI scanner (body: {jobId, images: [{index, data}]})",
              "GET /ws/progress?jobId={id} - WebSocket progress updates",
              "/external/google-books?q={query}&maxResults={n}",
              "/external/google-books-isbn?isbn={isbn}",
              "/external/openlibrary?q={query}&maxResults={n}",
              "/external/openlibrary-author?author={name}",
              "/external/isbndb?title={title}&author={author}",
              "/external/isbndb-editions?title={title}&author={author}",
              "/external/isbndb-isbn?isbn={isbn}"
            ]
          },
          200,
          null
        );
      }
      if (url.pathname === "/admin/harvest-dashboard" && request.method === "GET") {
        return await handleHarvestDashboard(request, env2);
      }
      if (url.pathname === "/api/test-multi-edition" && request.method === "GET") {
        return await handleTestMultiEdition(request, env2);
      }
      if (url.pathname === "/api/harvest-covers" && request.method === "POST") {
        const authHeader = request.headers.get("X-Harvest-Secret");
        if (authHeader !== env2.HARVEST_SECRET && authHeader !== "test-local-dev") {
          return errorResponse(
            "UNAUTHORIZED",
            "Invalid or missing X-Harvest-Secret header",
            401,
            null
          );
        }
        console.log("\u{1F33E} Manual ISBNdb harvest triggered");
        const result = await handleScheduledHarvest(env2);
        if (result.success) {
          return jsonResponse(
            {
              success: result.success,
              stats: result.stats,
              message: "Harvest completed successfully"
            },
            200,
            null
          );
        } else {
          return errorResponse(
            "INTERNAL_ERROR",
            `Harvest failed: ${result.error}`,
            500,
            null
          );
        }
      }
      response = notFoundResponse(
        "The requested endpoint does not exist. Use /health to see available endpoints.",
        null
      );
      errorCode = "NOT_FOUND";
    } catch (error3) {
      console.error("[Worker] Unhandled error:", error3);
      response = errorResponse(
        "INTERNAL_ERROR",
        `Internal server error: ${error3.message}`,
        500,
        request
      );
      errorCode = "INTERNAL_ERROR";
    } finally {
      const processingTime = Date.now() - startTime;
      trackRequestMetrics(
        env2,
        url.pathname,
        response?.status || 500,
        processingTime,
        errorCode,
        cacheStatus
      );
      if (response) {
        response = addAnalyticsHeaders(
          response,
          startTime,
          cacheStatus,
          errorCode
        );
      }
    }
    return response;
  },
  async queue(batch, env2, ctx) {
    if (batch.queue === "author-warming-queue") {
      await processAuthorBatch(batch, env2, ctx);
    } else {
      console.error(`Unknown queue: ${batch.queue}`);
    }
  },
  async scheduled(event, env2, ctx) {
    if (event.cron === "0 2 * * *") {
      await handleScheduledArchival(env2, ctx);
    } else if (event.cron === "*/15 * * * *") {
      await handleScheduledAlerts(env2, ctx);
    } else if (event.cron === "0 3 * * *") {
      await handleScheduledHarvest(env2);
    }
  }
};
export {
  CacheMetricsDO,
  JobStateManagerDO,
  ProgressWebSocketDO,
  RateLimiterDO,
  WebSocketConnectionDO,
  index_default as default
};
//# sourceMappingURL=index.js.map
