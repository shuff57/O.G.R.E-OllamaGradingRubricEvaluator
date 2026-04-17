import kt, { app as Me, ipcMain as be, WebContentsView as Gc, BrowserWindow as zt, net as Wc } from "electron";
import qe from "node:path";
import { fileURLToPath as lu } from "node:url";
import Lt from "node:fs";
import yt from "fs";
import Vc from "constants";
import Cr from "stream";
import yo from "util";
import uu from "assert";
import Le from "path";
import Zr from "child_process";
import cu from "events";
import Or from "crypto";
import fu from "tty";
import en from "os";
import wt from "url";
import du from "zlib";
import Xc from "http";
import Yc from "better-sqlite3";
import Ft from "node:os";
import zc from "node:net";
import { spawn as Kc } from "node:child_process";
import { createInterface as Xo } from "node:readline";
var it = typeof globalThis < "u" ? globalThis : typeof window < "u" ? window : typeof global < "u" ? global : typeof self < "u" ? self : {}, Ct = {}, dn = {}, qr = {}, Yo;
function Je() {
  return Yo || (Yo = 1, qr.fromCallback = function(e) {
    return Object.defineProperty(function(...n) {
      if (typeof n[n.length - 1] == "function") e.apply(this, n);
      else
        return new Promise((h, u) => {
          n.push((d, f) => d != null ? u(d) : h(f)), e.apply(this, n);
        });
    }, "name", { value: e.name });
  }, qr.fromPromise = function(e) {
    return Object.defineProperty(function(...n) {
      const h = n[n.length - 1];
      if (typeof h != "function") return e.apply(this, n);
      n.pop(), e.apply(this, n).then((u) => h(null, u), h);
    }, "name", { value: e.name });
  }), qr;
}
var hn, zo;
function Jc() {
  if (zo) return hn;
  zo = 1;
  var e = Vc, n = process.cwd, h = null, u = process.env.GRACEFUL_FS_PLATFORM || process.platform;
  process.cwd = function() {
    return h || (h = n.call(process)), h;
  };
  try {
    process.cwd();
  } catch {
  }
  if (typeof process.chdir == "function") {
    var d = process.chdir;
    process.chdir = function(o) {
      h = null, d.call(process, o);
    }, Object.setPrototypeOf && Object.setPrototypeOf(process.chdir, d);
  }
  hn = f;
  function f(o) {
    e.hasOwnProperty("O_SYMLINK") && process.version.match(/^v0\.6\.[0-2]|^v0\.5\./) && c(o), o.lutimes || a(o), o.chown = r(o.chown), o.fchown = r(o.fchown), o.lchown = r(o.lchown), o.chmod = l(o.chmod), o.fchmod = l(o.fchmod), o.lchmod = l(o.lchmod), o.chownSync = i(o.chownSync), o.fchownSync = i(o.fchownSync), o.lchownSync = i(o.lchownSync), o.chmodSync = s(o.chmodSync), o.fchmodSync = s(o.fchmodSync), o.lchmodSync = s(o.lchmodSync), o.stat = p(o.stat), o.fstat = p(o.fstat), o.lstat = p(o.lstat), o.statSync = E(o.statSync), o.fstatSync = E(o.fstatSync), o.lstatSync = E(o.lstatSync), o.chmod && !o.lchmod && (o.lchmod = function(m, _, R) {
      R && process.nextTick(R);
    }, o.lchmodSync = function() {
    }), o.chown && !o.lchown && (o.lchown = function(m, _, R, O) {
      O && process.nextTick(O);
    }, o.lchownSync = function() {
    }), u === "win32" && (o.rename = typeof o.rename != "function" ? o.rename : (function(m) {
      function _(R, O, I) {
        var b = Date.now(), P = 0;
        m(R, O, function C(T) {
          if (T && (T.code === "EACCES" || T.code === "EPERM" || T.code === "EBUSY") && Date.now() - b < 6e4) {
            setTimeout(function() {
              o.stat(O, function(N, w) {
                N && N.code === "ENOENT" ? m(R, O, C) : I(T);
              });
            }, P), P < 100 && (P += 10);
            return;
          }
          I && I(T);
        });
      }
      return Object.setPrototypeOf && Object.setPrototypeOf(_, m), _;
    })(o.rename)), o.read = typeof o.read != "function" ? o.read : (function(m) {
      function _(R, O, I, b, P, C) {
        var T;
        if (C && typeof C == "function") {
          var N = 0;
          T = function(w, q, k) {
            if (w && w.code === "EAGAIN" && N < 10)
              return N++, m.call(o, R, O, I, b, P, T);
            C.apply(this, arguments);
          };
        }
        return m.call(o, R, O, I, b, P, T);
      }
      return Object.setPrototypeOf && Object.setPrototypeOf(_, m), _;
    })(o.read), o.readSync = typeof o.readSync != "function" ? o.readSync : /* @__PURE__ */ (function(m) {
      return function(_, R, O, I, b) {
        for (var P = 0; ; )
          try {
            return m.call(o, _, R, O, I, b);
          } catch (C) {
            if (C.code === "EAGAIN" && P < 10) {
              P++;
              continue;
            }
            throw C;
          }
      };
    })(o.readSync);
    function c(m) {
      m.lchmod = function(_, R, O) {
        m.open(
          _,
          e.O_WRONLY | e.O_SYMLINK,
          R,
          function(I, b) {
            if (I) {
              O && O(I);
              return;
            }
            m.fchmod(b, R, function(P) {
              m.close(b, function(C) {
                O && O(P || C);
              });
            });
          }
        );
      }, m.lchmodSync = function(_, R) {
        var O = m.openSync(_, e.O_WRONLY | e.O_SYMLINK, R), I = !0, b;
        try {
          b = m.fchmodSync(O, R), I = !1;
        } finally {
          if (I)
            try {
              m.closeSync(O);
            } catch {
            }
          else
            m.closeSync(O);
        }
        return b;
      };
    }
    function a(m) {
      e.hasOwnProperty("O_SYMLINK") && m.futimes ? (m.lutimes = function(_, R, O, I) {
        m.open(_, e.O_SYMLINK, function(b, P) {
          if (b) {
            I && I(b);
            return;
          }
          m.futimes(P, R, O, function(C) {
            m.close(P, function(T) {
              I && I(C || T);
            });
          });
        });
      }, m.lutimesSync = function(_, R, O) {
        var I = m.openSync(_, e.O_SYMLINK), b, P = !0;
        try {
          b = m.futimesSync(I, R, O), P = !1;
        } finally {
          if (P)
            try {
              m.closeSync(I);
            } catch {
            }
          else
            m.closeSync(I);
        }
        return b;
      }) : m.futimes && (m.lutimes = function(_, R, O, I) {
        I && process.nextTick(I);
      }, m.lutimesSync = function() {
      });
    }
    function l(m) {
      return m && function(_, R, O) {
        return m.call(o, _, R, function(I) {
          v(I) && (I = null), O && O.apply(this, arguments);
        });
      };
    }
    function s(m) {
      return m && function(_, R) {
        try {
          return m.call(o, _, R);
        } catch (O) {
          if (!v(O)) throw O;
        }
      };
    }
    function r(m) {
      return m && function(_, R, O, I) {
        return m.call(o, _, R, O, function(b) {
          v(b) && (b = null), I && I.apply(this, arguments);
        });
      };
    }
    function i(m) {
      return m && function(_, R, O) {
        try {
          return m.call(o, _, R, O);
        } catch (I) {
          if (!v(I)) throw I;
        }
      };
    }
    function p(m) {
      return m && function(_, R, O) {
        typeof R == "function" && (O = R, R = null);
        function I(b, P) {
          P && (P.uid < 0 && (P.uid += 4294967296), P.gid < 0 && (P.gid += 4294967296)), O && O.apply(this, arguments);
        }
        return R ? m.call(o, _, R, I) : m.call(o, _, I);
      };
    }
    function E(m) {
      return m && function(_, R) {
        var O = R ? m.call(o, _, R) : m.call(o, _);
        return O && (O.uid < 0 && (O.uid += 4294967296), O.gid < 0 && (O.gid += 4294967296)), O;
      };
    }
    function v(m) {
      if (!m || m.code === "ENOSYS")
        return !0;
      var _ = !process.getuid || process.getuid() !== 0;
      return !!(_ && (m.code === "EINVAL" || m.code === "EPERM"));
    }
  }
  return hn;
}
var pn, Ko;
function Qc() {
  if (Ko) return pn;
  Ko = 1;
  var e = Cr.Stream;
  pn = n;
  function n(h) {
    return {
      ReadStream: u,
      WriteStream: d
    };
    function u(f, o) {
      if (!(this instanceof u)) return new u(f, o);
      e.call(this);
      var c = this;
      this.path = f, this.fd = null, this.readable = !0, this.paused = !1, this.flags = "r", this.mode = 438, this.bufferSize = 64 * 1024, o = o || {};
      for (var a = Object.keys(o), l = 0, s = a.length; l < s; l++) {
        var r = a[l];
        this[r] = o[r];
      }
      if (this.encoding && this.setEncoding(this.encoding), this.start !== void 0) {
        if (typeof this.start != "number")
          throw TypeError("start must be a Number");
        if (this.end === void 0)
          this.end = 1 / 0;
        else if (typeof this.end != "number")
          throw TypeError("end must be a Number");
        if (this.start > this.end)
          throw new Error("start must be <= end");
        this.pos = this.start;
      }
      if (this.fd !== null) {
        process.nextTick(function() {
          c._read();
        });
        return;
      }
      h.open(this.path, this.flags, this.mode, function(i, p) {
        if (i) {
          c.emit("error", i), c.readable = !1;
          return;
        }
        c.fd = p, c.emit("open", p), c._read();
      });
    }
    function d(f, o) {
      if (!(this instanceof d)) return new d(f, o);
      e.call(this), this.path = f, this.fd = null, this.writable = !0, this.flags = "w", this.encoding = "binary", this.mode = 438, this.bytesWritten = 0, o = o || {};
      for (var c = Object.keys(o), a = 0, l = c.length; a < l; a++) {
        var s = c[a];
        this[s] = o[s];
      }
      if (this.start !== void 0) {
        if (typeof this.start != "number")
          throw TypeError("start must be a Number");
        if (this.start < 0)
          throw new Error("start must be >= zero");
        this.pos = this.start;
      }
      this.busy = !1, this._queue = [], this.fd === null && (this._open = h.open, this._queue.push([this._open, this.path, this.flags, this.mode, void 0]), this.flush());
    }
  }
  return pn;
}
var mn, Jo;
function Zc() {
  if (Jo) return mn;
  Jo = 1, mn = n;
  var e = Object.getPrototypeOf || function(h) {
    return h.__proto__;
  };
  function n(h) {
    if (h === null || typeof h != "object")
      return h;
    if (h instanceof Object)
      var u = { __proto__: e(h) };
    else
      var u = /* @__PURE__ */ Object.create(null);
    return Object.getOwnPropertyNames(h).forEach(function(d) {
      Object.defineProperty(u, d, Object.getOwnPropertyDescriptor(h, d));
    }), u;
  }
  return mn;
}
var $r, Qo;
function ze() {
  if (Qo) return $r;
  Qo = 1;
  var e = yt, n = Jc(), h = Qc(), u = Zc(), d = yo, f, o;
  typeof Symbol == "function" && typeof Symbol.for == "function" ? (f = /* @__PURE__ */ Symbol.for("graceful-fs.queue"), o = /* @__PURE__ */ Symbol.for("graceful-fs.previous")) : (f = "___graceful-fs.queue", o = "___graceful-fs.previous");
  function c() {
  }
  function a(m, _) {
    Object.defineProperty(m, f, {
      get: function() {
        return _;
      }
    });
  }
  var l = c;
  if (d.debuglog ? l = d.debuglog("gfs4") : /\bgfs4\b/i.test(process.env.NODE_DEBUG || "") && (l = function() {
    var m = d.format.apply(d, arguments);
    m = "GFS4: " + m.split(/\n/).join(`
GFS4: `), console.error(m);
  }), !e[f]) {
    var s = it[f] || [];
    a(e, s), e.close = (function(m) {
      function _(R, O) {
        return m.call(e, R, function(I) {
          I || E(), typeof O == "function" && O.apply(this, arguments);
        });
      }
      return Object.defineProperty(_, o, {
        value: m
      }), _;
    })(e.close), e.closeSync = (function(m) {
      function _(R) {
        m.apply(e, arguments), E();
      }
      return Object.defineProperty(_, o, {
        value: m
      }), _;
    })(e.closeSync), /\bgfs4\b/i.test(process.env.NODE_DEBUG || "") && process.on("exit", function() {
      l(e[f]), uu.equal(e[f].length, 0);
    });
  }
  it[f] || a(it, e[f]), $r = r(u(e)), process.env.TEST_GRACEFUL_FS_GLOBAL_PATCH && !e.__patched && ($r = r(e), e.__patched = !0);
  function r(m) {
    n(m), m.gracefulify = r, m.createReadStream = he, m.createWriteStream = Z;
    var _ = m.readFile;
    m.readFile = R;
    function R(Q, ce, Ee) {
      return typeof ce == "function" && (Ee = ce, ce = null), Te(Q, ce, Ee);
      function Te(Oe, Ce, _e, y) {
        return _(Oe, Ce, function(g) {
          g && (g.code === "EMFILE" || g.code === "ENFILE") ? i([Te, [Oe, Ce, _e], g, y || Date.now(), Date.now()]) : typeof _e == "function" && _e.apply(this, arguments);
        });
      }
    }
    var O = m.writeFile;
    m.writeFile = I;
    function I(Q, ce, Ee, Te) {
      return typeof Ee == "function" && (Te = Ee, Ee = null), Oe(Q, ce, Ee, Te);
      function Oe(Ce, _e, y, g, $) {
        return O(Ce, _e, y, function(D) {
          D && (D.code === "EMFILE" || D.code === "ENFILE") ? i([Oe, [Ce, _e, y, g], D, $ || Date.now(), Date.now()]) : typeof g == "function" && g.apply(this, arguments);
        });
      }
    }
    var b = m.appendFile;
    b && (m.appendFile = P);
    function P(Q, ce, Ee, Te) {
      return typeof Ee == "function" && (Te = Ee, Ee = null), Oe(Q, ce, Ee, Te);
      function Oe(Ce, _e, y, g, $) {
        return b(Ce, _e, y, function(D) {
          D && (D.code === "EMFILE" || D.code === "ENFILE") ? i([Oe, [Ce, _e, y, g], D, $ || Date.now(), Date.now()]) : typeof g == "function" && g.apply(this, arguments);
        });
      }
    }
    var C = m.copyFile;
    C && (m.copyFile = T);
    function T(Q, ce, Ee, Te) {
      return typeof Ee == "function" && (Te = Ee, Ee = 0), Oe(Q, ce, Ee, Te);
      function Oe(Ce, _e, y, g, $) {
        return C(Ce, _e, y, function(D) {
          D && (D.code === "EMFILE" || D.code === "ENFILE") ? i([Oe, [Ce, _e, y, g], D, $ || Date.now(), Date.now()]) : typeof g == "function" && g.apply(this, arguments);
        });
      }
    }
    var N = m.readdir;
    m.readdir = q;
    var w = /^v[0-5]\./;
    function q(Q, ce, Ee) {
      typeof ce == "function" && (Ee = ce, ce = null);
      var Te = w.test(process.version) ? function(_e, y, g, $) {
        return N(_e, Oe(
          _e,
          y,
          g,
          $
        ));
      } : function(_e, y, g, $) {
        return N(_e, y, Oe(
          _e,
          y,
          g,
          $
        ));
      };
      return Te(Q, ce, Ee);
      function Oe(Ce, _e, y, g) {
        return function($, D) {
          $ && ($.code === "EMFILE" || $.code === "ENFILE") ? i([
            Te,
            [Ce, _e, y],
            $,
            g || Date.now(),
            Date.now()
          ]) : (D && D.sort && D.sort(), typeof y == "function" && y.call(this, $, D));
        };
      }
    }
    if (process.version.substr(0, 4) === "v0.8") {
      var k = h(m);
      L = k.ReadStream, X = k.WriteStream;
    }
    var M = m.ReadStream;
    M && (L.prototype = Object.create(M.prototype), L.prototype.open = G);
    var U = m.WriteStream;
    U && (X.prototype = Object.create(U.prototype), X.prototype.open = ee), Object.defineProperty(m, "ReadStream", {
      get: function() {
        return L;
      },
      set: function(Q) {
        L = Q;
      },
      enumerable: !0,
      configurable: !0
    }), Object.defineProperty(m, "WriteStream", {
      get: function() {
        return X;
      },
      set: function(Q) {
        X = Q;
      },
      enumerable: !0,
      configurable: !0
    });
    var F = L;
    Object.defineProperty(m, "FileReadStream", {
      get: function() {
        return F;
      },
      set: function(Q) {
        F = Q;
      },
      enumerable: !0,
      configurable: !0
    });
    var H = X;
    Object.defineProperty(m, "FileWriteStream", {
      get: function() {
        return H;
      },
      set: function(Q) {
        H = Q;
      },
      enumerable: !0,
      configurable: !0
    });
    function L(Q, ce) {
      return this instanceof L ? (M.apply(this, arguments), this) : L.apply(Object.create(L.prototype), arguments);
    }
    function G() {
      var Q = this;
      pe(Q.path, Q.flags, Q.mode, function(ce, Ee) {
        ce ? (Q.autoClose && Q.destroy(), Q.emit("error", ce)) : (Q.fd = Ee, Q.emit("open", Ee), Q.read());
      });
    }
    function X(Q, ce) {
      return this instanceof X ? (U.apply(this, arguments), this) : X.apply(Object.create(X.prototype), arguments);
    }
    function ee() {
      var Q = this;
      pe(Q.path, Q.flags, Q.mode, function(ce, Ee) {
        ce ? (Q.destroy(), Q.emit("error", ce)) : (Q.fd = Ee, Q.emit("open", Ee));
      });
    }
    function he(Q, ce) {
      return new m.ReadStream(Q, ce);
    }
    function Z(Q, ce) {
      return new m.WriteStream(Q, ce);
    }
    var ge = m.open;
    m.open = pe;
    function pe(Q, ce, Ee, Te) {
      return typeof Ee == "function" && (Te = Ee, Ee = null), Oe(Q, ce, Ee, Te);
      function Oe(Ce, _e, y, g, $) {
        return ge(Ce, _e, y, function(D, ye) {
          D && (D.code === "EMFILE" || D.code === "ENFILE") ? i([Oe, [Ce, _e, y, g], D, $ || Date.now(), Date.now()]) : typeof g == "function" && g.apply(this, arguments);
        });
      }
    }
    return m;
  }
  function i(m) {
    l("ENQUEUE", m[0].name, m[1]), e[f].push(m), v();
  }
  var p;
  function E() {
    for (var m = Date.now(), _ = 0; _ < e[f].length; ++_)
      e[f][_].length > 2 && (e[f][_][3] = m, e[f][_][4] = m);
    v();
  }
  function v() {
    if (clearTimeout(p), p = void 0, e[f].length !== 0) {
      var m = e[f].shift(), _ = m[0], R = m[1], O = m[2], I = m[3], b = m[4];
      if (I === void 0)
        l("RETRY", _.name, R), _.apply(null, R);
      else if (Date.now() - I >= 6e4) {
        l("TIMEOUT", _.name, R);
        var P = R.pop();
        typeof P == "function" && P.call(null, O);
      } else {
        var C = Date.now() - b, T = Math.max(b - I, 1), N = Math.min(T * 1.2, 100);
        C >= N ? (l("RETRY", _.name, R), _.apply(null, R.concat([I]))) : e[f].push(m);
      }
      p === void 0 && (p = setTimeout(v, 0));
    }
  }
  return $r;
}
var Zo;
function Kt() {
  return Zo || (Zo = 1, (function(e) {
    const n = Je().fromCallback, h = ze(), u = [
      "access",
      "appendFile",
      "chmod",
      "chown",
      "close",
      "copyFile",
      "fchmod",
      "fchown",
      "fdatasync",
      "fstat",
      "fsync",
      "ftruncate",
      "futimes",
      "lchmod",
      "lchown",
      "link",
      "lstat",
      "mkdir",
      "mkdtemp",
      "open",
      "opendir",
      "readdir",
      "readFile",
      "readlink",
      "realpath",
      "rename",
      "rm",
      "rmdir",
      "stat",
      "symlink",
      "truncate",
      "unlink",
      "utimes",
      "writeFile"
    ].filter((d) => typeof h[d] == "function");
    Object.assign(e, h), u.forEach((d) => {
      e[d] = n(h[d]);
    }), e.exists = function(d, f) {
      return typeof f == "function" ? h.exists(d, f) : new Promise((o) => h.exists(d, o));
    }, e.read = function(d, f, o, c, a, l) {
      return typeof l == "function" ? h.read(d, f, o, c, a, l) : new Promise((s, r) => {
        h.read(d, f, o, c, a, (i, p, E) => {
          if (i) return r(i);
          s({ bytesRead: p, buffer: E });
        });
      });
    }, e.write = function(d, f, ...o) {
      return typeof o[o.length - 1] == "function" ? h.write(d, f, ...o) : new Promise((c, a) => {
        h.write(d, f, ...o, (l, s, r) => {
          if (l) return a(l);
          c({ bytesWritten: s, buffer: r });
        });
      });
    }, typeof h.writev == "function" && (e.writev = function(d, f, ...o) {
      return typeof o[o.length - 1] == "function" ? h.writev(d, f, ...o) : new Promise((c, a) => {
        h.writev(d, f, ...o, (l, s, r) => {
          if (l) return a(l);
          c({ bytesWritten: s, buffers: r });
        });
      });
    }), typeof h.realpath.native == "function" ? e.realpath.native = n(h.realpath.native) : process.emitWarning(
      "fs.realpath.native is not a function. Is fs being monkey-patched?",
      "Warning",
      "fs-extra-WARN0003"
    );
  })(dn)), dn;
}
var Mr = {}, gn = {}, ea;
function ef() {
  if (ea) return gn;
  ea = 1;
  const e = Le;
  return gn.checkPath = function(h) {
    if (process.platform === "win32" && /[<>:"|?*]/.test(h.replace(e.parse(h).root, ""))) {
      const d = new Error(`Path contains invalid characters: ${h}`);
      throw d.code = "EINVAL", d;
    }
  }, gn;
}
var ta;
function tf() {
  if (ta) return Mr;
  ta = 1;
  const e = /* @__PURE__ */ Kt(), { checkPath: n } = /* @__PURE__ */ ef(), h = (u) => {
    const d = { mode: 511 };
    return typeof u == "number" ? u : { ...d, ...u }.mode;
  };
  return Mr.makeDir = async (u, d) => (n(u), e.mkdir(u, {
    mode: h(d),
    recursive: !0
  })), Mr.makeDirSync = (u, d) => (n(u), e.mkdirSync(u, {
    mode: h(d),
    recursive: !0
  })), Mr;
}
var En, ra;
function ct() {
  if (ra) return En;
  ra = 1;
  const e = Je().fromPromise, { makeDir: n, makeDirSync: h } = /* @__PURE__ */ tf(), u = e(n);
  return En = {
    mkdirs: u,
    mkdirsSync: h,
    // alias
    mkdirp: u,
    mkdirpSync: h,
    ensureDir: u,
    ensureDirSync: h
  }, En;
}
var vn, na;
function qt() {
  if (na) return vn;
  na = 1;
  const e = Je().fromPromise, n = /* @__PURE__ */ Kt();
  function h(u) {
    return n.access(u).then(() => !0).catch(() => !1);
  }
  return vn = {
    pathExists: e(h),
    pathExistsSync: n.existsSync
  }, vn;
}
var yn, ia;
function hu() {
  if (ia) return yn;
  ia = 1;
  const e = ze();
  function n(u, d, f, o) {
    e.open(u, "r+", (c, a) => {
      if (c) return o(c);
      e.futimes(a, d, f, (l) => {
        e.close(a, (s) => {
          o && o(l || s);
        });
      });
    });
  }
  function h(u, d, f) {
    const o = e.openSync(u, "r+");
    return e.futimesSync(o, d, f), e.closeSync(o);
  }
  return yn = {
    utimesMillis: n,
    utimesMillisSync: h
  }, yn;
}
var wn, oa;
function Jt() {
  if (oa) return wn;
  oa = 1;
  const e = /* @__PURE__ */ Kt(), n = Le, h = yo;
  function u(i, p, E) {
    const v = E.dereference ? (m) => e.stat(m, { bigint: !0 }) : (m) => e.lstat(m, { bigint: !0 });
    return Promise.all([
      v(i),
      v(p).catch((m) => {
        if (m.code === "ENOENT") return null;
        throw m;
      })
    ]).then(([m, _]) => ({ srcStat: m, destStat: _ }));
  }
  function d(i, p, E) {
    let v;
    const m = E.dereference ? (R) => e.statSync(R, { bigint: !0 }) : (R) => e.lstatSync(R, { bigint: !0 }), _ = m(i);
    try {
      v = m(p);
    } catch (R) {
      if (R.code === "ENOENT") return { srcStat: _, destStat: null };
      throw R;
    }
    return { srcStat: _, destStat: v };
  }
  function f(i, p, E, v, m) {
    h.callbackify(u)(i, p, v, (_, R) => {
      if (_) return m(_);
      const { srcStat: O, destStat: I } = R;
      if (I) {
        if (l(O, I)) {
          const b = n.basename(i), P = n.basename(p);
          return E === "move" && b !== P && b.toLowerCase() === P.toLowerCase() ? m(null, { srcStat: O, destStat: I, isChangingCase: !0 }) : m(new Error("Source and destination must not be the same."));
        }
        if (O.isDirectory() && !I.isDirectory())
          return m(new Error(`Cannot overwrite non-directory '${p}' with directory '${i}'.`));
        if (!O.isDirectory() && I.isDirectory())
          return m(new Error(`Cannot overwrite directory '${p}' with non-directory '${i}'.`));
      }
      return O.isDirectory() && s(i, p) ? m(new Error(r(i, p, E))) : m(null, { srcStat: O, destStat: I });
    });
  }
  function o(i, p, E, v) {
    const { srcStat: m, destStat: _ } = d(i, p, v);
    if (_) {
      if (l(m, _)) {
        const R = n.basename(i), O = n.basename(p);
        if (E === "move" && R !== O && R.toLowerCase() === O.toLowerCase())
          return { srcStat: m, destStat: _, isChangingCase: !0 };
        throw new Error("Source and destination must not be the same.");
      }
      if (m.isDirectory() && !_.isDirectory())
        throw new Error(`Cannot overwrite non-directory '${p}' with directory '${i}'.`);
      if (!m.isDirectory() && _.isDirectory())
        throw new Error(`Cannot overwrite directory '${p}' with non-directory '${i}'.`);
    }
    if (m.isDirectory() && s(i, p))
      throw new Error(r(i, p, E));
    return { srcStat: m, destStat: _ };
  }
  function c(i, p, E, v, m) {
    const _ = n.resolve(n.dirname(i)), R = n.resolve(n.dirname(E));
    if (R === _ || R === n.parse(R).root) return m();
    e.stat(R, { bigint: !0 }, (O, I) => O ? O.code === "ENOENT" ? m() : m(O) : l(p, I) ? m(new Error(r(i, E, v))) : c(i, p, R, v, m));
  }
  function a(i, p, E, v) {
    const m = n.resolve(n.dirname(i)), _ = n.resolve(n.dirname(E));
    if (_ === m || _ === n.parse(_).root) return;
    let R;
    try {
      R = e.statSync(_, { bigint: !0 });
    } catch (O) {
      if (O.code === "ENOENT") return;
      throw O;
    }
    if (l(p, R))
      throw new Error(r(i, E, v));
    return a(i, p, _, v);
  }
  function l(i, p) {
    return p.ino && p.dev && p.ino === i.ino && p.dev === i.dev;
  }
  function s(i, p) {
    const E = n.resolve(i).split(n.sep).filter((m) => m), v = n.resolve(p).split(n.sep).filter((m) => m);
    return E.reduce((m, _, R) => m && v[R] === _, !0);
  }
  function r(i, p, E) {
    return `Cannot ${E} '${i}' to a subdirectory of itself, '${p}'.`;
  }
  return wn = {
    checkPaths: f,
    checkPathsSync: o,
    checkParentPaths: c,
    checkParentPathsSync: a,
    isSrcSubdir: s,
    areIdentical: l
  }, wn;
}
var _n, aa;
function rf() {
  if (aa) return _n;
  aa = 1;
  const e = ze(), n = Le, h = ct().mkdirs, u = qt().pathExists, d = hu().utimesMillis, f = /* @__PURE__ */ Jt();
  function o(q, k, M, U) {
    typeof M == "function" && !U ? (U = M, M = {}) : typeof M == "function" && (M = { filter: M }), U = U || function() {
    }, M = M || {}, M.clobber = "clobber" in M ? !!M.clobber : !0, M.overwrite = "overwrite" in M ? !!M.overwrite : M.clobber, M.preserveTimestamps && process.arch === "ia32" && process.emitWarning(
      `Using the preserveTimestamps option in 32-bit node is not recommended;

	see https://github.com/jprichardson/node-fs-extra/issues/269`,
      "Warning",
      "fs-extra-WARN0001"
    ), f.checkPaths(q, k, "copy", M, (F, H) => {
      if (F) return U(F);
      const { srcStat: L, destStat: G } = H;
      f.checkParentPaths(q, L, k, "copy", (X) => X ? U(X) : M.filter ? a(c, G, q, k, M, U) : c(G, q, k, M, U));
    });
  }
  function c(q, k, M, U, F) {
    const H = n.dirname(M);
    u(H, (L, G) => {
      if (L) return F(L);
      if (G) return s(q, k, M, U, F);
      h(H, (X) => X ? F(X) : s(q, k, M, U, F));
    });
  }
  function a(q, k, M, U, F, H) {
    Promise.resolve(F.filter(M, U)).then((L) => L ? q(k, M, U, F, H) : H(), (L) => H(L));
  }
  function l(q, k, M, U, F) {
    return U.filter ? a(s, q, k, M, U, F) : s(q, k, M, U, F);
  }
  function s(q, k, M, U, F) {
    (U.dereference ? e.stat : e.lstat)(k, (L, G) => L ? F(L) : G.isDirectory() ? I(G, q, k, M, U, F) : G.isFile() || G.isCharacterDevice() || G.isBlockDevice() ? r(G, q, k, M, U, F) : G.isSymbolicLink() ? N(q, k, M, U, F) : G.isSocket() ? F(new Error(`Cannot copy a socket file: ${k}`)) : G.isFIFO() ? F(new Error(`Cannot copy a FIFO pipe: ${k}`)) : F(new Error(`Unknown file: ${k}`)));
  }
  function r(q, k, M, U, F, H) {
    return k ? i(q, M, U, F, H) : p(q, M, U, F, H);
  }
  function i(q, k, M, U, F) {
    if (U.overwrite)
      e.unlink(M, (H) => H ? F(H) : p(q, k, M, U, F));
    else return U.errorOnExist ? F(new Error(`'${M}' already exists`)) : F();
  }
  function p(q, k, M, U, F) {
    e.copyFile(k, M, (H) => H ? F(H) : U.preserveTimestamps ? E(q.mode, k, M, F) : R(M, q.mode, F));
  }
  function E(q, k, M, U) {
    return v(q) ? m(M, q, (F) => F ? U(F) : _(q, k, M, U)) : _(q, k, M, U);
  }
  function v(q) {
    return (q & 128) === 0;
  }
  function m(q, k, M) {
    return R(q, k | 128, M);
  }
  function _(q, k, M, U) {
    O(k, M, (F) => F ? U(F) : R(M, q, U));
  }
  function R(q, k, M) {
    return e.chmod(q, k, M);
  }
  function O(q, k, M) {
    e.stat(q, (U, F) => U ? M(U) : d(k, F.atime, F.mtime, M));
  }
  function I(q, k, M, U, F, H) {
    return k ? P(M, U, F, H) : b(q.mode, M, U, F, H);
  }
  function b(q, k, M, U, F) {
    e.mkdir(M, (H) => {
      if (H) return F(H);
      P(k, M, U, (L) => L ? F(L) : R(M, q, F));
    });
  }
  function P(q, k, M, U) {
    e.readdir(q, (F, H) => F ? U(F) : C(H, q, k, M, U));
  }
  function C(q, k, M, U, F) {
    const H = q.pop();
    return H ? T(q, H, k, M, U, F) : F();
  }
  function T(q, k, M, U, F, H) {
    const L = n.join(M, k), G = n.join(U, k);
    f.checkPaths(L, G, "copy", F, (X, ee) => {
      if (X) return H(X);
      const { destStat: he } = ee;
      l(he, L, G, F, (Z) => Z ? H(Z) : C(q, M, U, F, H));
    });
  }
  function N(q, k, M, U, F) {
    e.readlink(k, (H, L) => {
      if (H) return F(H);
      if (U.dereference && (L = n.resolve(process.cwd(), L)), q)
        e.readlink(M, (G, X) => G ? G.code === "EINVAL" || G.code === "UNKNOWN" ? e.symlink(L, M, F) : F(G) : (U.dereference && (X = n.resolve(process.cwd(), X)), f.isSrcSubdir(L, X) ? F(new Error(`Cannot copy '${L}' to a subdirectory of itself, '${X}'.`)) : q.isDirectory() && f.isSrcSubdir(X, L) ? F(new Error(`Cannot overwrite '${X}' with '${L}'.`)) : w(L, M, F)));
      else
        return e.symlink(L, M, F);
    });
  }
  function w(q, k, M) {
    e.unlink(k, (U) => U ? M(U) : e.symlink(q, k, M));
  }
  return _n = o, _n;
}
var Tn, sa;
function nf() {
  if (sa) return Tn;
  sa = 1;
  const e = ze(), n = Le, h = ct().mkdirsSync, u = hu().utimesMillisSync, d = /* @__PURE__ */ Jt();
  function f(C, T, N) {
    typeof N == "function" && (N = { filter: N }), N = N || {}, N.clobber = "clobber" in N ? !!N.clobber : !0, N.overwrite = "overwrite" in N ? !!N.overwrite : N.clobber, N.preserveTimestamps && process.arch === "ia32" && process.emitWarning(
      `Using the preserveTimestamps option in 32-bit node is not recommended;

	see https://github.com/jprichardson/node-fs-extra/issues/269`,
      "Warning",
      "fs-extra-WARN0002"
    );
    const { srcStat: w, destStat: q } = d.checkPathsSync(C, T, "copy", N);
    return d.checkParentPathsSync(C, w, T, "copy"), o(q, C, T, N);
  }
  function o(C, T, N, w) {
    if (w.filter && !w.filter(T, N)) return;
    const q = n.dirname(N);
    return e.existsSync(q) || h(q), a(C, T, N, w);
  }
  function c(C, T, N, w) {
    if (!(w.filter && !w.filter(T, N)))
      return a(C, T, N, w);
  }
  function a(C, T, N, w) {
    const k = (w.dereference ? e.statSync : e.lstatSync)(T);
    if (k.isDirectory()) return _(k, C, T, N, w);
    if (k.isFile() || k.isCharacterDevice() || k.isBlockDevice()) return l(k, C, T, N, w);
    if (k.isSymbolicLink()) return b(C, T, N, w);
    throw k.isSocket() ? new Error(`Cannot copy a socket file: ${T}`) : k.isFIFO() ? new Error(`Cannot copy a FIFO pipe: ${T}`) : new Error(`Unknown file: ${T}`);
  }
  function l(C, T, N, w, q) {
    return T ? s(C, N, w, q) : r(C, N, w, q);
  }
  function s(C, T, N, w) {
    if (w.overwrite)
      return e.unlinkSync(N), r(C, T, N, w);
    if (w.errorOnExist)
      throw new Error(`'${N}' already exists`);
  }
  function r(C, T, N, w) {
    return e.copyFileSync(T, N), w.preserveTimestamps && i(C.mode, T, N), v(N, C.mode);
  }
  function i(C, T, N) {
    return p(C) && E(N, C), m(T, N);
  }
  function p(C) {
    return (C & 128) === 0;
  }
  function E(C, T) {
    return v(C, T | 128);
  }
  function v(C, T) {
    return e.chmodSync(C, T);
  }
  function m(C, T) {
    const N = e.statSync(C);
    return u(T, N.atime, N.mtime);
  }
  function _(C, T, N, w, q) {
    return T ? O(N, w, q) : R(C.mode, N, w, q);
  }
  function R(C, T, N, w) {
    return e.mkdirSync(N), O(T, N, w), v(N, C);
  }
  function O(C, T, N) {
    e.readdirSync(C).forEach((w) => I(w, C, T, N));
  }
  function I(C, T, N, w) {
    const q = n.join(T, C), k = n.join(N, C), { destStat: M } = d.checkPathsSync(q, k, "copy", w);
    return c(M, q, k, w);
  }
  function b(C, T, N, w) {
    let q = e.readlinkSync(T);
    if (w.dereference && (q = n.resolve(process.cwd(), q)), C) {
      let k;
      try {
        k = e.readlinkSync(N);
      } catch (M) {
        if (M.code === "EINVAL" || M.code === "UNKNOWN") return e.symlinkSync(q, N);
        throw M;
      }
      if (w.dereference && (k = n.resolve(process.cwd(), k)), d.isSrcSubdir(q, k))
        throw new Error(`Cannot copy '${q}' to a subdirectory of itself, '${k}'.`);
      if (e.statSync(N).isDirectory() && d.isSrcSubdir(k, q))
        throw new Error(`Cannot overwrite '${k}' with '${q}'.`);
      return P(q, N);
    } else
      return e.symlinkSync(q, N);
  }
  function P(C, T) {
    return e.unlinkSync(T), e.symlinkSync(C, T);
  }
  return Tn = f, Tn;
}
var An, la;
function wo() {
  if (la) return An;
  la = 1;
  const e = Je().fromCallback;
  return An = {
    copy: e(/* @__PURE__ */ rf()),
    copySync: /* @__PURE__ */ nf()
  }, An;
}
var Rn, ua;
function of() {
  if (ua) return Rn;
  ua = 1;
  const e = ze(), n = Le, h = uu, u = process.platform === "win32";
  function d(E) {
    [
      "unlink",
      "chmod",
      "stat",
      "lstat",
      "rmdir",
      "readdir"
    ].forEach((m) => {
      E[m] = E[m] || e[m], m = m + "Sync", E[m] = E[m] || e[m];
    }), E.maxBusyTries = E.maxBusyTries || 3;
  }
  function f(E, v, m) {
    let _ = 0;
    typeof v == "function" && (m = v, v = {}), h(E, "rimraf: missing path"), h.strictEqual(typeof E, "string", "rimraf: path should be a string"), h.strictEqual(typeof m, "function", "rimraf: callback function required"), h(v, "rimraf: invalid options argument provided"), h.strictEqual(typeof v, "object", "rimraf: options should be object"), d(v), o(E, v, function R(O) {
      if (O) {
        if ((O.code === "EBUSY" || O.code === "ENOTEMPTY" || O.code === "EPERM") && _ < v.maxBusyTries) {
          _++;
          const I = _ * 100;
          return setTimeout(() => o(E, v, R), I);
        }
        O.code === "ENOENT" && (O = null);
      }
      m(O);
    });
  }
  function o(E, v, m) {
    h(E), h(v), h(typeof m == "function"), v.lstat(E, (_, R) => {
      if (_ && _.code === "ENOENT")
        return m(null);
      if (_ && _.code === "EPERM" && u)
        return c(E, v, _, m);
      if (R && R.isDirectory())
        return l(E, v, _, m);
      v.unlink(E, (O) => {
        if (O) {
          if (O.code === "ENOENT")
            return m(null);
          if (O.code === "EPERM")
            return u ? c(E, v, O, m) : l(E, v, O, m);
          if (O.code === "EISDIR")
            return l(E, v, O, m);
        }
        return m(O);
      });
    });
  }
  function c(E, v, m, _) {
    h(E), h(v), h(typeof _ == "function"), v.chmod(E, 438, (R) => {
      R ? _(R.code === "ENOENT" ? null : m) : v.stat(E, (O, I) => {
        O ? _(O.code === "ENOENT" ? null : m) : I.isDirectory() ? l(E, v, m, _) : v.unlink(E, _);
      });
    });
  }
  function a(E, v, m) {
    let _;
    h(E), h(v);
    try {
      v.chmodSync(E, 438);
    } catch (R) {
      if (R.code === "ENOENT")
        return;
      throw m;
    }
    try {
      _ = v.statSync(E);
    } catch (R) {
      if (R.code === "ENOENT")
        return;
      throw m;
    }
    _.isDirectory() ? i(E, v, m) : v.unlinkSync(E);
  }
  function l(E, v, m, _) {
    h(E), h(v), h(typeof _ == "function"), v.rmdir(E, (R) => {
      R && (R.code === "ENOTEMPTY" || R.code === "EEXIST" || R.code === "EPERM") ? s(E, v, _) : R && R.code === "ENOTDIR" ? _(m) : _(R);
    });
  }
  function s(E, v, m) {
    h(E), h(v), h(typeof m == "function"), v.readdir(E, (_, R) => {
      if (_) return m(_);
      let O = R.length, I;
      if (O === 0) return v.rmdir(E, m);
      R.forEach((b) => {
        f(n.join(E, b), v, (P) => {
          if (!I) {
            if (P) return m(I = P);
            --O === 0 && v.rmdir(E, m);
          }
        });
      });
    });
  }
  function r(E, v) {
    let m;
    v = v || {}, d(v), h(E, "rimraf: missing path"), h.strictEqual(typeof E, "string", "rimraf: path should be a string"), h(v, "rimraf: missing options"), h.strictEqual(typeof v, "object", "rimraf: options should be object");
    try {
      m = v.lstatSync(E);
    } catch (_) {
      if (_.code === "ENOENT")
        return;
      _.code === "EPERM" && u && a(E, v, _);
    }
    try {
      m && m.isDirectory() ? i(E, v, null) : v.unlinkSync(E);
    } catch (_) {
      if (_.code === "ENOENT")
        return;
      if (_.code === "EPERM")
        return u ? a(E, v, _) : i(E, v, _);
      if (_.code !== "EISDIR")
        throw _;
      i(E, v, _);
    }
  }
  function i(E, v, m) {
    h(E), h(v);
    try {
      v.rmdirSync(E);
    } catch (_) {
      if (_.code === "ENOTDIR")
        throw m;
      if (_.code === "ENOTEMPTY" || _.code === "EEXIST" || _.code === "EPERM")
        p(E, v);
      else if (_.code !== "ENOENT")
        throw _;
    }
  }
  function p(E, v) {
    if (h(E), h(v), v.readdirSync(E).forEach((m) => r(n.join(E, m), v)), u) {
      const m = Date.now();
      do
        try {
          return v.rmdirSync(E, v);
        } catch {
        }
      while (Date.now() - m < 500);
    } else
      return v.rmdirSync(E, v);
  }
  return Rn = f, f.sync = r, Rn;
}
var bn, ca;
function tn() {
  if (ca) return bn;
  ca = 1;
  const e = ze(), n = Je().fromCallback, h = /* @__PURE__ */ of();
  function u(f, o) {
    if (e.rm) return e.rm(f, { recursive: !0, force: !0 }, o);
    h(f, o);
  }
  function d(f) {
    if (e.rmSync) return e.rmSync(f, { recursive: !0, force: !0 });
    h.sync(f);
  }
  return bn = {
    remove: n(u),
    removeSync: d
  }, bn;
}
var Sn, fa;
function af() {
  if (fa) return Sn;
  fa = 1;
  const e = Je().fromPromise, n = /* @__PURE__ */ Kt(), h = Le, u = /* @__PURE__ */ ct(), d = /* @__PURE__ */ tn(), f = e(async function(a) {
    let l;
    try {
      l = await n.readdir(a);
    } catch {
      return u.mkdirs(a);
    }
    return Promise.all(l.map((s) => d.remove(h.join(a, s))));
  });
  function o(c) {
    let a;
    try {
      a = n.readdirSync(c);
    } catch {
      return u.mkdirsSync(c);
    }
    a.forEach((l) => {
      l = h.join(c, l), d.removeSync(l);
    });
  }
  return Sn = {
    emptyDirSync: o,
    emptydirSync: o,
    emptyDir: f,
    emptydir: f
  }, Sn;
}
var Cn, da;
function sf() {
  if (da) return Cn;
  da = 1;
  const e = Je().fromCallback, n = Le, h = ze(), u = /* @__PURE__ */ ct();
  function d(o, c) {
    function a() {
      h.writeFile(o, "", (l) => {
        if (l) return c(l);
        c();
      });
    }
    h.stat(o, (l, s) => {
      if (!l && s.isFile()) return c();
      const r = n.dirname(o);
      h.stat(r, (i, p) => {
        if (i)
          return i.code === "ENOENT" ? u.mkdirs(r, (E) => {
            if (E) return c(E);
            a();
          }) : c(i);
        p.isDirectory() ? a() : h.readdir(r, (E) => {
          if (E) return c(E);
        });
      });
    });
  }
  function f(o) {
    let c;
    try {
      c = h.statSync(o);
    } catch {
    }
    if (c && c.isFile()) return;
    const a = n.dirname(o);
    try {
      h.statSync(a).isDirectory() || h.readdirSync(a);
    } catch (l) {
      if (l && l.code === "ENOENT") u.mkdirsSync(a);
      else throw l;
    }
    h.writeFileSync(o, "");
  }
  return Cn = {
    createFile: e(d),
    createFileSync: f
  }, Cn;
}
var On, ha;
function lf() {
  if (ha) return On;
  ha = 1;
  const e = Je().fromCallback, n = Le, h = ze(), u = /* @__PURE__ */ ct(), d = qt().pathExists, { areIdentical: f } = /* @__PURE__ */ Jt();
  function o(a, l, s) {
    function r(i, p) {
      h.link(i, p, (E) => {
        if (E) return s(E);
        s(null);
      });
    }
    h.lstat(l, (i, p) => {
      h.lstat(a, (E, v) => {
        if (E)
          return E.message = E.message.replace("lstat", "ensureLink"), s(E);
        if (p && f(v, p)) return s(null);
        const m = n.dirname(l);
        d(m, (_, R) => {
          if (_) return s(_);
          if (R) return r(a, l);
          u.mkdirs(m, (O) => {
            if (O) return s(O);
            r(a, l);
          });
        });
      });
    });
  }
  function c(a, l) {
    let s;
    try {
      s = h.lstatSync(l);
    } catch {
    }
    try {
      const p = h.lstatSync(a);
      if (s && f(p, s)) return;
    } catch (p) {
      throw p.message = p.message.replace("lstat", "ensureLink"), p;
    }
    const r = n.dirname(l);
    return h.existsSync(r) || u.mkdirsSync(r), h.linkSync(a, l);
  }
  return On = {
    createLink: e(o),
    createLinkSync: c
  }, On;
}
var Nn, pa;
function uf() {
  if (pa) return Nn;
  pa = 1;
  const e = Le, n = ze(), h = qt().pathExists;
  function u(f, o, c) {
    if (e.isAbsolute(f))
      return n.lstat(f, (a) => a ? (a.message = a.message.replace("lstat", "ensureSymlink"), c(a)) : c(null, {
        toCwd: f,
        toDst: f
      }));
    {
      const a = e.dirname(o), l = e.join(a, f);
      return h(l, (s, r) => s ? c(s) : r ? c(null, {
        toCwd: l,
        toDst: f
      }) : n.lstat(f, (i) => i ? (i.message = i.message.replace("lstat", "ensureSymlink"), c(i)) : c(null, {
        toCwd: f,
        toDst: e.relative(a, f)
      })));
    }
  }
  function d(f, o) {
    let c;
    if (e.isAbsolute(f)) {
      if (c = n.existsSync(f), !c) throw new Error("absolute srcpath does not exist");
      return {
        toCwd: f,
        toDst: f
      };
    } else {
      const a = e.dirname(o), l = e.join(a, f);
      if (c = n.existsSync(l), c)
        return {
          toCwd: l,
          toDst: f
        };
      if (c = n.existsSync(f), !c) throw new Error("relative srcpath does not exist");
      return {
        toCwd: f,
        toDst: e.relative(a, f)
      };
    }
  }
  return Nn = {
    symlinkPaths: u,
    symlinkPathsSync: d
  }, Nn;
}
var Pn, ma;
function cf() {
  if (ma) return Pn;
  ma = 1;
  const e = ze();
  function n(u, d, f) {
    if (f = typeof d == "function" ? d : f, d = typeof d == "function" ? !1 : d, d) return f(null, d);
    e.lstat(u, (o, c) => {
      if (o) return f(null, "file");
      d = c && c.isDirectory() ? "dir" : "file", f(null, d);
    });
  }
  function h(u, d) {
    let f;
    if (d) return d;
    try {
      f = e.lstatSync(u);
    } catch {
      return "file";
    }
    return f && f.isDirectory() ? "dir" : "file";
  }
  return Pn = {
    symlinkType: n,
    symlinkTypeSync: h
  }, Pn;
}
var Dn, ga;
function ff() {
  if (ga) return Dn;
  ga = 1;
  const e = Je().fromCallback, n = Le, h = /* @__PURE__ */ Kt(), u = /* @__PURE__ */ ct(), d = u.mkdirs, f = u.mkdirsSync, o = /* @__PURE__ */ uf(), c = o.symlinkPaths, a = o.symlinkPathsSync, l = /* @__PURE__ */ cf(), s = l.symlinkType, r = l.symlinkTypeSync, i = qt().pathExists, { areIdentical: p } = /* @__PURE__ */ Jt();
  function E(_, R, O, I) {
    I = typeof O == "function" ? O : I, O = typeof O == "function" ? !1 : O, h.lstat(R, (b, P) => {
      !b && P.isSymbolicLink() ? Promise.all([
        h.stat(_),
        h.stat(R)
      ]).then(([C, T]) => {
        if (p(C, T)) return I(null);
        v(_, R, O, I);
      }) : v(_, R, O, I);
    });
  }
  function v(_, R, O, I) {
    c(_, R, (b, P) => {
      if (b) return I(b);
      _ = P.toDst, s(P.toCwd, O, (C, T) => {
        if (C) return I(C);
        const N = n.dirname(R);
        i(N, (w, q) => {
          if (w) return I(w);
          if (q) return h.symlink(_, R, T, I);
          d(N, (k) => {
            if (k) return I(k);
            h.symlink(_, R, T, I);
          });
        });
      });
    });
  }
  function m(_, R, O) {
    let I;
    try {
      I = h.lstatSync(R);
    } catch {
    }
    if (I && I.isSymbolicLink()) {
      const T = h.statSync(_), N = h.statSync(R);
      if (p(T, N)) return;
    }
    const b = a(_, R);
    _ = b.toDst, O = r(b.toCwd, O);
    const P = n.dirname(R);
    return h.existsSync(P) || f(P), h.symlinkSync(_, R, O);
  }
  return Dn = {
    createSymlink: e(E),
    createSymlinkSync: m
  }, Dn;
}
var In, Ea;
function df() {
  if (Ea) return In;
  Ea = 1;
  const { createFile: e, createFileSync: n } = /* @__PURE__ */ sf(), { createLink: h, createLinkSync: u } = /* @__PURE__ */ lf(), { createSymlink: d, createSymlinkSync: f } = /* @__PURE__ */ ff();
  return In = {
    // file
    createFile: e,
    createFileSync: n,
    ensureFile: e,
    ensureFileSync: n,
    // link
    createLink: h,
    createLinkSync: u,
    ensureLink: h,
    ensureLinkSync: u,
    // symlink
    createSymlink: d,
    createSymlinkSync: f,
    ensureSymlink: d,
    ensureSymlinkSync: f
  }, In;
}
var Ln, va;
function _o() {
  if (va) return Ln;
  va = 1;
  function e(h, { EOL: u = `
`, finalEOL: d = !0, replacer: f = null, spaces: o } = {}) {
    const c = d ? u : "";
    return JSON.stringify(h, f, o).replace(/\n/g, u) + c;
  }
  function n(h) {
    return Buffer.isBuffer(h) && (h = h.toString("utf8")), h.replace(/^\uFEFF/, "");
  }
  return Ln = { stringify: e, stripBom: n }, Ln;
}
var Fn, ya;
function hf() {
  if (ya) return Fn;
  ya = 1;
  let e;
  try {
    e = ze();
  } catch {
    e = yt;
  }
  const n = Je(), { stringify: h, stripBom: u } = _o();
  async function d(s, r = {}) {
    typeof r == "string" && (r = { encoding: r });
    const i = r.fs || e, p = "throws" in r ? r.throws : !0;
    let E = await n.fromCallback(i.readFile)(s, r);
    E = u(E);
    let v;
    try {
      v = JSON.parse(E, r ? r.reviver : null);
    } catch (m) {
      if (p)
        throw m.message = `${s}: ${m.message}`, m;
      return null;
    }
    return v;
  }
  const f = n.fromPromise(d);
  function o(s, r = {}) {
    typeof r == "string" && (r = { encoding: r });
    const i = r.fs || e, p = "throws" in r ? r.throws : !0;
    try {
      let E = i.readFileSync(s, r);
      return E = u(E), JSON.parse(E, r.reviver);
    } catch (E) {
      if (p)
        throw E.message = `${s}: ${E.message}`, E;
      return null;
    }
  }
  async function c(s, r, i = {}) {
    const p = i.fs || e, E = h(r, i);
    await n.fromCallback(p.writeFile)(s, E, i);
  }
  const a = n.fromPromise(c);
  function l(s, r, i = {}) {
    const p = i.fs || e, E = h(r, i);
    return p.writeFileSync(s, E, i);
  }
  return Fn = {
    readFile: f,
    readFileSync: o,
    writeFile: a,
    writeFileSync: l
  }, Fn;
}
var Un, wa;
function pf() {
  if (wa) return Un;
  wa = 1;
  const e = hf();
  return Un = {
    // jsonfile exports
    readJson: e.readFile,
    readJsonSync: e.readFileSync,
    writeJson: e.writeFile,
    writeJsonSync: e.writeFileSync
  }, Un;
}
var xn, _a;
function To() {
  if (_a) return xn;
  _a = 1;
  const e = Je().fromCallback, n = ze(), h = Le, u = /* @__PURE__ */ ct(), d = qt().pathExists;
  function f(c, a, l, s) {
    typeof l == "function" && (s = l, l = "utf8");
    const r = h.dirname(c);
    d(r, (i, p) => {
      if (i) return s(i);
      if (p) return n.writeFile(c, a, l, s);
      u.mkdirs(r, (E) => {
        if (E) return s(E);
        n.writeFile(c, a, l, s);
      });
    });
  }
  function o(c, ...a) {
    const l = h.dirname(c);
    if (n.existsSync(l))
      return n.writeFileSync(c, ...a);
    u.mkdirsSync(l), n.writeFileSync(c, ...a);
  }
  return xn = {
    outputFile: e(f),
    outputFileSync: o
  }, xn;
}
var kn, Ta;
function mf() {
  if (Ta) return kn;
  Ta = 1;
  const { stringify: e } = _o(), { outputFile: n } = /* @__PURE__ */ To();
  async function h(u, d, f = {}) {
    const o = e(d, f);
    await n(u, o, f);
  }
  return kn = h, kn;
}
var qn, Aa;
function gf() {
  if (Aa) return qn;
  Aa = 1;
  const { stringify: e } = _o(), { outputFileSync: n } = /* @__PURE__ */ To();
  function h(u, d, f) {
    const o = e(d, f);
    n(u, o, f);
  }
  return qn = h, qn;
}
var $n, Ra;
function Ef() {
  if (Ra) return $n;
  Ra = 1;
  const e = Je().fromPromise, n = /* @__PURE__ */ pf();
  return n.outputJson = e(/* @__PURE__ */ mf()), n.outputJsonSync = /* @__PURE__ */ gf(), n.outputJSON = n.outputJson, n.outputJSONSync = n.outputJsonSync, n.writeJSON = n.writeJson, n.writeJSONSync = n.writeJsonSync, n.readJSON = n.readJson, n.readJSONSync = n.readJsonSync, $n = n, $n;
}
var Mn, ba;
function vf() {
  if (ba) return Mn;
  ba = 1;
  const e = ze(), n = Le, h = wo().copy, u = tn().remove, d = ct().mkdirp, f = qt().pathExists, o = /* @__PURE__ */ Jt();
  function c(i, p, E, v) {
    typeof E == "function" && (v = E, E = {}), E = E || {};
    const m = E.overwrite || E.clobber || !1;
    o.checkPaths(i, p, "move", E, (_, R) => {
      if (_) return v(_);
      const { srcStat: O, isChangingCase: I = !1 } = R;
      o.checkParentPaths(i, O, p, "move", (b) => {
        if (b) return v(b);
        if (a(p)) return l(i, p, m, I, v);
        d(n.dirname(p), (P) => P ? v(P) : l(i, p, m, I, v));
      });
    });
  }
  function a(i) {
    const p = n.dirname(i);
    return n.parse(p).root === p;
  }
  function l(i, p, E, v, m) {
    if (v) return s(i, p, E, m);
    if (E)
      return u(p, (_) => _ ? m(_) : s(i, p, E, m));
    f(p, (_, R) => _ ? m(_) : R ? m(new Error("dest already exists.")) : s(i, p, E, m));
  }
  function s(i, p, E, v) {
    e.rename(i, p, (m) => m ? m.code !== "EXDEV" ? v(m) : r(i, p, E, v) : v());
  }
  function r(i, p, E, v) {
    h(i, p, {
      overwrite: E,
      errorOnExist: !0
    }, (_) => _ ? v(_) : u(i, v));
  }
  return Mn = c, Mn;
}
var Bn, Sa;
function yf() {
  if (Sa) return Bn;
  Sa = 1;
  const e = ze(), n = Le, h = wo().copySync, u = tn().removeSync, d = ct().mkdirpSync, f = /* @__PURE__ */ Jt();
  function o(r, i, p) {
    p = p || {};
    const E = p.overwrite || p.clobber || !1, { srcStat: v, isChangingCase: m = !1 } = f.checkPathsSync(r, i, "move", p);
    return f.checkParentPathsSync(r, v, i, "move"), c(i) || d(n.dirname(i)), a(r, i, E, m);
  }
  function c(r) {
    const i = n.dirname(r);
    return n.parse(i).root === i;
  }
  function a(r, i, p, E) {
    if (E) return l(r, i, p);
    if (p)
      return u(i), l(r, i, p);
    if (e.existsSync(i)) throw new Error("dest already exists.");
    return l(r, i, p);
  }
  function l(r, i, p) {
    try {
      e.renameSync(r, i);
    } catch (E) {
      if (E.code !== "EXDEV") throw E;
      return s(r, i, p);
    }
  }
  function s(r, i, p) {
    return h(r, i, {
      overwrite: p,
      errorOnExist: !0
    }), u(r);
  }
  return Bn = o, Bn;
}
var jn, Ca;
function wf() {
  if (Ca) return jn;
  Ca = 1;
  const e = Je().fromCallback;
  return jn = {
    move: e(/* @__PURE__ */ vf()),
    moveSync: /* @__PURE__ */ yf()
  }, jn;
}
var Hn, Oa;
function _t() {
  return Oa || (Oa = 1, Hn = {
    // Export promiseified graceful-fs:
    .../* @__PURE__ */ Kt(),
    // Export extra methods:
    .../* @__PURE__ */ wo(),
    .../* @__PURE__ */ af(),
    .../* @__PURE__ */ df(),
    .../* @__PURE__ */ Ef(),
    .../* @__PURE__ */ ct(),
    .../* @__PURE__ */ wf(),
    .../* @__PURE__ */ To(),
    .../* @__PURE__ */ qt(),
    .../* @__PURE__ */ tn()
  }), Hn;
}
var rr = {}, Ot = {}, Gn = {}, Nt = {}, Na;
function Ao() {
  if (Na) return Nt;
  Na = 1, Object.defineProperty(Nt, "__esModule", { value: !0 }), Nt.CancellationError = Nt.CancellationToken = void 0;
  const e = cu;
  let n = class extends e.EventEmitter {
    get cancelled() {
      return this._cancelled || this._parent != null && this._parent.cancelled;
    }
    set parent(d) {
      this.removeParentCancelHandler(), this._parent = d, this.parentCancelHandler = () => this.cancel(), this._parent.onCancel(this.parentCancelHandler);
    }
    // babel cannot compile ... correctly for super calls
    constructor(d) {
      super(), this.parentCancelHandler = null, this._parent = null, this._cancelled = !1, d != null && (this.parent = d);
    }
    cancel() {
      this._cancelled = !0, this.emit("cancel");
    }
    onCancel(d) {
      this.cancelled ? d() : this.once("cancel", d);
    }
    createPromise(d) {
      if (this.cancelled)
        return Promise.reject(new h());
      const f = () => {
        if (o != null)
          try {
            this.removeListener("cancel", o), o = null;
          } catch {
          }
      };
      let o = null;
      return new Promise((c, a) => {
        let l = null;
        if (o = () => {
          try {
            l != null && (l(), l = null);
          } finally {
            a(new h());
          }
        }, this.cancelled) {
          o();
          return;
        }
        this.onCancel(o), d(c, a, (s) => {
          l = s;
        });
      }).then((c) => (f(), c)).catch((c) => {
        throw f(), c;
      });
    }
    removeParentCancelHandler() {
      const d = this._parent;
      d != null && this.parentCancelHandler != null && (d.removeListener("cancel", this.parentCancelHandler), this.parentCancelHandler = null);
    }
    dispose() {
      try {
        this.removeParentCancelHandler();
      } finally {
        this.removeAllListeners(), this._parent = null;
      }
    }
  };
  Nt.CancellationToken = n;
  class h extends Error {
    constructor() {
      super("cancelled");
    }
  }
  return Nt.CancellationError = h, Nt;
}
var Br = {}, Pa;
function rn() {
  if (Pa) return Br;
  Pa = 1, Object.defineProperty(Br, "__esModule", { value: !0 }), Br.newError = e;
  function e(n, h) {
    const u = new Error(n);
    return u.code = h, u;
  }
  return Br;
}
var We = {}, jr = { exports: {} }, Hr = { exports: {} }, Wn, Da;
function _f() {
  if (Da) return Wn;
  Da = 1;
  var e = 1e3, n = e * 60, h = n * 60, u = h * 24, d = u * 7, f = u * 365.25;
  Wn = function(s, r) {
    r = r || {};
    var i = typeof s;
    if (i === "string" && s.length > 0)
      return o(s);
    if (i === "number" && isFinite(s))
      return r.long ? a(s) : c(s);
    throw new Error(
      "val is not a non-empty string or a valid number. val=" + JSON.stringify(s)
    );
  };
  function o(s) {
    if (s = String(s), !(s.length > 100)) {
      var r = /^(-?(?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)?$/i.exec(
        s
      );
      if (r) {
        var i = parseFloat(r[1]), p = (r[2] || "ms").toLowerCase();
        switch (p) {
          case "years":
          case "year":
          case "yrs":
          case "yr":
          case "y":
            return i * f;
          case "weeks":
          case "week":
          case "w":
            return i * d;
          case "days":
          case "day":
          case "d":
            return i * u;
          case "hours":
          case "hour":
          case "hrs":
          case "hr":
          case "h":
            return i * h;
          case "minutes":
          case "minute":
          case "mins":
          case "min":
          case "m":
            return i * n;
          case "seconds":
          case "second":
          case "secs":
          case "sec":
          case "s":
            return i * e;
          case "milliseconds":
          case "millisecond":
          case "msecs":
          case "msec":
          case "ms":
            return i;
          default:
            return;
        }
      }
    }
  }
  function c(s) {
    var r = Math.abs(s);
    return r >= u ? Math.round(s / u) + "d" : r >= h ? Math.round(s / h) + "h" : r >= n ? Math.round(s / n) + "m" : r >= e ? Math.round(s / e) + "s" : s + "ms";
  }
  function a(s) {
    var r = Math.abs(s);
    return r >= u ? l(s, r, u, "day") : r >= h ? l(s, r, h, "hour") : r >= n ? l(s, r, n, "minute") : r >= e ? l(s, r, e, "second") : s + " ms";
  }
  function l(s, r, i, p) {
    var E = r >= i * 1.5;
    return Math.round(s / i) + " " + p + (E ? "s" : "");
  }
  return Wn;
}
var Vn, Ia;
function pu() {
  if (Ia) return Vn;
  Ia = 1;
  function e(n) {
    u.debug = u, u.default = u, u.coerce = l, u.disable = c, u.enable = f, u.enabled = a, u.humanize = _f(), u.destroy = s, Object.keys(n).forEach((r) => {
      u[r] = n[r];
    }), u.names = [], u.skips = [], u.formatters = {};
    function h(r) {
      let i = 0;
      for (let p = 0; p < r.length; p++)
        i = (i << 5) - i + r.charCodeAt(p), i |= 0;
      return u.colors[Math.abs(i) % u.colors.length];
    }
    u.selectColor = h;
    function u(r) {
      let i, p = null, E, v;
      function m(..._) {
        if (!m.enabled)
          return;
        const R = m, O = Number(/* @__PURE__ */ new Date()), I = O - (i || O);
        R.diff = I, R.prev = i, R.curr = O, i = O, _[0] = u.coerce(_[0]), typeof _[0] != "string" && _.unshift("%O");
        let b = 0;
        _[0] = _[0].replace(/%([a-zA-Z%])/g, (C, T) => {
          if (C === "%%")
            return "%";
          b++;
          const N = u.formatters[T];
          if (typeof N == "function") {
            const w = _[b];
            C = N.call(R, w), _.splice(b, 1), b--;
          }
          return C;
        }), u.formatArgs.call(R, _), (R.log || u.log).apply(R, _);
      }
      return m.namespace = r, m.useColors = u.useColors(), m.color = u.selectColor(r), m.extend = d, m.destroy = u.destroy, Object.defineProperty(m, "enabled", {
        enumerable: !0,
        configurable: !1,
        get: () => p !== null ? p : (E !== u.namespaces && (E = u.namespaces, v = u.enabled(r)), v),
        set: (_) => {
          p = _;
        }
      }), typeof u.init == "function" && u.init(m), m;
    }
    function d(r, i) {
      const p = u(this.namespace + (typeof i > "u" ? ":" : i) + r);
      return p.log = this.log, p;
    }
    function f(r) {
      u.save(r), u.namespaces = r, u.names = [], u.skips = [];
      const i = (typeof r == "string" ? r : "").trim().replace(/\s+/g, ",").split(",").filter(Boolean);
      for (const p of i)
        p[0] === "-" ? u.skips.push(p.slice(1)) : u.names.push(p);
    }
    function o(r, i) {
      let p = 0, E = 0, v = -1, m = 0;
      for (; p < r.length; )
        if (E < i.length && (i[E] === r[p] || i[E] === "*"))
          i[E] === "*" ? (v = E, m = p, E++) : (p++, E++);
        else if (v !== -1)
          E = v + 1, m++, p = m;
        else
          return !1;
      for (; E < i.length && i[E] === "*"; )
        E++;
      return E === i.length;
    }
    function c() {
      const r = [
        ...u.names,
        ...u.skips.map((i) => "-" + i)
      ].join(",");
      return u.enable(""), r;
    }
    function a(r) {
      for (const i of u.skips)
        if (o(r, i))
          return !1;
      for (const i of u.names)
        if (o(r, i))
          return !0;
      return !1;
    }
    function l(r) {
      return r instanceof Error ? r.stack || r.message : r;
    }
    function s() {
      console.warn("Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`.");
    }
    return u.enable(u.load()), u;
  }
  return Vn = e, Vn;
}
var La;
function Tf() {
  return La || (La = 1, (function(e, n) {
    n.formatArgs = u, n.save = d, n.load = f, n.useColors = h, n.storage = o(), n.destroy = /* @__PURE__ */ (() => {
      let a = !1;
      return () => {
        a || (a = !0, console.warn("Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`."));
      };
    })(), n.colors = [
      "#0000CC",
      "#0000FF",
      "#0033CC",
      "#0033FF",
      "#0066CC",
      "#0066FF",
      "#0099CC",
      "#0099FF",
      "#00CC00",
      "#00CC33",
      "#00CC66",
      "#00CC99",
      "#00CCCC",
      "#00CCFF",
      "#3300CC",
      "#3300FF",
      "#3333CC",
      "#3333FF",
      "#3366CC",
      "#3366FF",
      "#3399CC",
      "#3399FF",
      "#33CC00",
      "#33CC33",
      "#33CC66",
      "#33CC99",
      "#33CCCC",
      "#33CCFF",
      "#6600CC",
      "#6600FF",
      "#6633CC",
      "#6633FF",
      "#66CC00",
      "#66CC33",
      "#9900CC",
      "#9900FF",
      "#9933CC",
      "#9933FF",
      "#99CC00",
      "#99CC33",
      "#CC0000",
      "#CC0033",
      "#CC0066",
      "#CC0099",
      "#CC00CC",
      "#CC00FF",
      "#CC3300",
      "#CC3333",
      "#CC3366",
      "#CC3399",
      "#CC33CC",
      "#CC33FF",
      "#CC6600",
      "#CC6633",
      "#CC9900",
      "#CC9933",
      "#CCCC00",
      "#CCCC33",
      "#FF0000",
      "#FF0033",
      "#FF0066",
      "#FF0099",
      "#FF00CC",
      "#FF00FF",
      "#FF3300",
      "#FF3333",
      "#FF3366",
      "#FF3399",
      "#FF33CC",
      "#FF33FF",
      "#FF6600",
      "#FF6633",
      "#FF9900",
      "#FF9933",
      "#FFCC00",
      "#FFCC33"
    ];
    function h() {
      if (typeof window < "u" && window.process && (window.process.type === "renderer" || window.process.__nwjs))
        return !0;
      if (typeof navigator < "u" && navigator.userAgent && navigator.userAgent.toLowerCase().match(/(edge|trident)\/(\d+)/))
        return !1;
      let a;
      return typeof document < "u" && document.documentElement && document.documentElement.style && document.documentElement.style.WebkitAppearance || // Is firebug? http://stackoverflow.com/a/398120/376773
      typeof window < "u" && window.console && (window.console.firebug || window.console.exception && window.console.table) || // Is firefox >= v31?
      // https://developer.mozilla.org/en-US/docs/Tools/Web_Console#Styling_messages
      typeof navigator < "u" && navigator.userAgent && (a = navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/)) && parseInt(a[1], 10) >= 31 || // Double check webkit in userAgent just in case we are in a worker
      typeof navigator < "u" && navigator.userAgent && navigator.userAgent.toLowerCase().match(/applewebkit\/(\d+)/);
    }
    function u(a) {
      if (a[0] = (this.useColors ? "%c" : "") + this.namespace + (this.useColors ? " %c" : " ") + a[0] + (this.useColors ? "%c " : " ") + "+" + e.exports.humanize(this.diff), !this.useColors)
        return;
      const l = "color: " + this.color;
      a.splice(1, 0, l, "color: inherit");
      let s = 0, r = 0;
      a[0].replace(/%[a-zA-Z%]/g, (i) => {
        i !== "%%" && (s++, i === "%c" && (r = s));
      }), a.splice(r, 0, l);
    }
    n.log = console.debug || console.log || (() => {
    });
    function d(a) {
      try {
        a ? n.storage.setItem("debug", a) : n.storage.removeItem("debug");
      } catch {
      }
    }
    function f() {
      let a;
      try {
        a = n.storage.getItem("debug") || n.storage.getItem("DEBUG");
      } catch {
      }
      return !a && typeof process < "u" && "env" in process && (a = process.env.DEBUG), a;
    }
    function o() {
      try {
        return localStorage;
      } catch {
      }
    }
    e.exports = pu()(n);
    const { formatters: c } = e.exports;
    c.j = function(a) {
      try {
        return JSON.stringify(a);
      } catch (l) {
        return "[UnexpectedJSONParseError]: " + l.message;
      }
    };
  })(Hr, Hr.exports)), Hr.exports;
}
var Gr = { exports: {} }, Xn, Fa;
function Af() {
  return Fa || (Fa = 1, Xn = (e, n = process.argv) => {
    const h = e.startsWith("-") ? "" : e.length === 1 ? "-" : "--", u = n.indexOf(h + e), d = n.indexOf("--");
    return u !== -1 && (d === -1 || u < d);
  }), Xn;
}
var Yn, Ua;
function Rf() {
  if (Ua) return Yn;
  Ua = 1;
  const e = en, n = fu, h = Af(), { env: u } = process;
  let d;
  h("no-color") || h("no-colors") || h("color=false") || h("color=never") ? d = 0 : (h("color") || h("colors") || h("color=true") || h("color=always")) && (d = 1), "FORCE_COLOR" in u && (u.FORCE_COLOR === "true" ? d = 1 : u.FORCE_COLOR === "false" ? d = 0 : d = u.FORCE_COLOR.length === 0 ? 1 : Math.min(parseInt(u.FORCE_COLOR, 10), 3));
  function f(a) {
    return a === 0 ? !1 : {
      level: a,
      hasBasic: !0,
      has256: a >= 2,
      has16m: a >= 3
    };
  }
  function o(a, l) {
    if (d === 0)
      return 0;
    if (h("color=16m") || h("color=full") || h("color=truecolor"))
      return 3;
    if (h("color=256"))
      return 2;
    if (a && !l && d === void 0)
      return 0;
    const s = d || 0;
    if (u.TERM === "dumb")
      return s;
    if (process.platform === "win32") {
      const r = e.release().split(".");
      return Number(r[0]) >= 10 && Number(r[2]) >= 10586 ? Number(r[2]) >= 14931 ? 3 : 2 : 1;
    }
    if ("CI" in u)
      return ["TRAVIS", "CIRCLECI", "APPVEYOR", "GITLAB_CI", "GITHUB_ACTIONS", "BUILDKITE"].some((r) => r in u) || u.CI_NAME === "codeship" ? 1 : s;
    if ("TEAMCITY_VERSION" in u)
      return /^(9\.(0*[1-9]\d*)\.|\d{2,}\.)/.test(u.TEAMCITY_VERSION) ? 1 : 0;
    if (u.COLORTERM === "truecolor")
      return 3;
    if ("TERM_PROGRAM" in u) {
      const r = parseInt((u.TERM_PROGRAM_VERSION || "").split(".")[0], 10);
      switch (u.TERM_PROGRAM) {
        case "iTerm.app":
          return r >= 3 ? 3 : 2;
        case "Apple_Terminal":
          return 2;
      }
    }
    return /-256(color)?$/i.test(u.TERM) ? 2 : /^screen|^xterm|^vt100|^vt220|^rxvt|color|ansi|cygwin|linux/i.test(u.TERM) || "COLORTERM" in u ? 1 : s;
  }
  function c(a) {
    const l = o(a, a && a.isTTY);
    return f(l);
  }
  return Yn = {
    supportsColor: c,
    stdout: f(o(!0, n.isatty(1))),
    stderr: f(o(!0, n.isatty(2)))
  }, Yn;
}
var xa;
function bf() {
  return xa || (xa = 1, (function(e, n) {
    const h = fu, u = yo;
    n.init = s, n.log = c, n.formatArgs = f, n.save = a, n.load = l, n.useColors = d, n.destroy = u.deprecate(
      () => {
      },
      "Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`."
    ), n.colors = [6, 2, 3, 4, 5, 1];
    try {
      const i = Rf();
      i && (i.stderr || i).level >= 2 && (n.colors = [
        20,
        21,
        26,
        27,
        32,
        33,
        38,
        39,
        40,
        41,
        42,
        43,
        44,
        45,
        56,
        57,
        62,
        63,
        68,
        69,
        74,
        75,
        76,
        77,
        78,
        79,
        80,
        81,
        92,
        93,
        98,
        99,
        112,
        113,
        128,
        129,
        134,
        135,
        148,
        149,
        160,
        161,
        162,
        163,
        164,
        165,
        166,
        167,
        168,
        169,
        170,
        171,
        172,
        173,
        178,
        179,
        184,
        185,
        196,
        197,
        198,
        199,
        200,
        201,
        202,
        203,
        204,
        205,
        206,
        207,
        208,
        209,
        214,
        215,
        220,
        221
      ]);
    } catch {
    }
    n.inspectOpts = Object.keys(process.env).filter((i) => /^debug_/i.test(i)).reduce((i, p) => {
      const E = p.substring(6).toLowerCase().replace(/_([a-z])/g, (m, _) => _.toUpperCase());
      let v = process.env[p];
      return /^(yes|on|true|enabled)$/i.test(v) ? v = !0 : /^(no|off|false|disabled)$/i.test(v) ? v = !1 : v === "null" ? v = null : v = Number(v), i[E] = v, i;
    }, {});
    function d() {
      return "colors" in n.inspectOpts ? !!n.inspectOpts.colors : h.isatty(process.stderr.fd);
    }
    function f(i) {
      const { namespace: p, useColors: E } = this;
      if (E) {
        const v = this.color, m = "\x1B[3" + (v < 8 ? v : "8;5;" + v), _ = `  ${m};1m${p} \x1B[0m`;
        i[0] = _ + i[0].split(`
`).join(`
` + _), i.push(m + "m+" + e.exports.humanize(this.diff) + "\x1B[0m");
      } else
        i[0] = o() + p + " " + i[0];
    }
    function o() {
      return n.inspectOpts.hideDate ? "" : (/* @__PURE__ */ new Date()).toISOString() + " ";
    }
    function c(...i) {
      return process.stderr.write(u.formatWithOptions(n.inspectOpts, ...i) + `
`);
    }
    function a(i) {
      i ? process.env.DEBUG = i : delete process.env.DEBUG;
    }
    function l() {
      return process.env.DEBUG;
    }
    function s(i) {
      i.inspectOpts = {};
      const p = Object.keys(n.inspectOpts);
      for (let E = 0; E < p.length; E++)
        i.inspectOpts[p[E]] = n.inspectOpts[p[E]];
    }
    e.exports = pu()(n);
    const { formatters: r } = e.exports;
    r.o = function(i) {
      return this.inspectOpts.colors = this.useColors, u.inspect(i, this.inspectOpts).split(`
`).map((p) => p.trim()).join(" ");
    }, r.O = function(i) {
      return this.inspectOpts.colors = this.useColors, u.inspect(i, this.inspectOpts);
    };
  })(Gr, Gr.exports)), Gr.exports;
}
var ka;
function Sf() {
  return ka || (ka = 1, typeof process > "u" || process.type === "renderer" || process.browser === !0 || process.__nwjs ? jr.exports = Tf() : jr.exports = bf()), jr.exports;
}
var nr = {}, qa;
function mu() {
  if (qa) return nr;
  qa = 1, Object.defineProperty(nr, "__esModule", { value: !0 }), nr.ProgressCallbackTransform = void 0;
  const e = Cr;
  let n = class extends e.Transform {
    constructor(u, d, f) {
      super(), this.total = u, this.cancellationToken = d, this.onProgress = f, this.start = Date.now(), this.transferred = 0, this.delta = 0, this.nextUpdate = this.start + 1e3;
    }
    _transform(u, d, f) {
      if (this.cancellationToken.cancelled) {
        f(new Error("cancelled"), null);
        return;
      }
      this.transferred += u.length, this.delta += u.length;
      const o = Date.now();
      o >= this.nextUpdate && this.transferred !== this.total && (this.nextUpdate = o + 1e3, this.onProgress({
        total: this.total,
        delta: this.delta,
        transferred: this.transferred,
        percent: this.transferred / this.total * 100,
        bytesPerSecond: Math.round(this.transferred / ((o - this.start) / 1e3))
      }), this.delta = 0), f(null, u);
    }
    _flush(u) {
      if (this.cancellationToken.cancelled) {
        u(new Error("cancelled"));
        return;
      }
      this.onProgress({
        total: this.total,
        delta: this.delta,
        transferred: this.total,
        percent: 100,
        bytesPerSecond: Math.round(this.transferred / ((Date.now() - this.start) / 1e3))
      }), this.delta = 0, u(null);
    }
  };
  return nr.ProgressCallbackTransform = n, nr;
}
var $a;
function Cf() {
  if ($a) return We;
  $a = 1, Object.defineProperty(We, "__esModule", { value: !0 }), We.DigestTransform = We.HttpExecutor = We.HttpError = void 0, We.createHttpError = l, We.parseJson = i, We.configureRequestOptionsFromUrl = v, We.configureRequestUrl = m, We.safeGetHeader = O, We.configureRequestOptions = b, We.safeStringifyJson = P;
  const e = Or, n = Sf(), h = yt, u = Cr, d = wt, f = Ao(), o = rn(), c = mu(), a = (0, n.default)("electron-builder");
  function l(C, T = null) {
    return new r(C.statusCode || -1, `${C.statusCode} ${C.statusMessage}` + (T == null ? "" : `
` + JSON.stringify(T, null, "  ")) + `
Headers: ` + P(C.headers), T);
  }
  const s = /* @__PURE__ */ new Map([
    [429, "Too many requests"],
    [400, "Bad request"],
    [403, "Forbidden"],
    [404, "Not found"],
    [405, "Method not allowed"],
    [406, "Not acceptable"],
    [408, "Request timeout"],
    [413, "Request entity too large"],
    [500, "Internal server error"],
    [502, "Bad gateway"],
    [503, "Service unavailable"],
    [504, "Gateway timeout"],
    [505, "HTTP version not supported"]
  ]);
  class r extends Error {
    constructor(T, N = `HTTP error: ${s.get(T) || T}`, w = null) {
      super(N), this.statusCode = T, this.description = w, this.name = "HttpError", this.code = `HTTP_ERROR_${T}`;
    }
    isServerError() {
      return this.statusCode >= 500 && this.statusCode <= 599;
    }
  }
  We.HttpError = r;
  function i(C) {
    return C.then((T) => T == null || T.length === 0 ? null : JSON.parse(T));
  }
  class p {
    constructor() {
      this.maxRedirects = 10;
    }
    request(T, N = new f.CancellationToken(), w) {
      b(T);
      const q = w == null ? void 0 : JSON.stringify(w), k = q ? Buffer.from(q) : void 0;
      if (k != null) {
        a(q);
        const { headers: M, ...U } = T;
        T = {
          method: "post",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": k.length,
            ...M
          },
          ...U
        };
      }
      return this.doApiRequest(T, N, (M) => M.end(k));
    }
    doApiRequest(T, N, w, q = 0) {
      return a.enabled && a(`Request: ${P(T)}`), N.createPromise((k, M, U) => {
        const F = this.createRequest(T, (H) => {
          try {
            this.handleResponse(H, T, N, k, M, q, w);
          } catch (L) {
            M(L);
          }
        });
        this.addErrorAndTimeoutHandlers(F, M, T.timeout), this.addRedirectHandlers(F, T, M, q, (H) => {
          this.doApiRequest(H, N, w, q).then(k).catch(M);
        }), w(F, M), U(() => F.abort());
      });
    }
    // noinspection JSUnusedLocalSymbols
    // eslint-disable-next-line
    addRedirectHandlers(T, N, w, q, k) {
    }
    addErrorAndTimeoutHandlers(T, N, w = 60 * 1e3) {
      this.addTimeOutHandler(T, N, w), T.on("error", N), T.on("aborted", () => {
        N(new Error("Request has been aborted by the server"));
      });
    }
    handleResponse(T, N, w, q, k, M, U) {
      var F;
      if (a.enabled && a(`Response: ${T.statusCode} ${T.statusMessage}, request options: ${P(N)}`), T.statusCode === 404) {
        k(l(T, `method: ${N.method || "GET"} url: ${N.protocol || "https:"}//${N.hostname}${N.port ? `:${N.port}` : ""}${N.path}

Please double check that your authentication token is correct. Due to security reasons, actual status maybe not reported, but 404.
`));
        return;
      } else if (T.statusCode === 204) {
        q();
        return;
      }
      const H = (F = T.statusCode) !== null && F !== void 0 ? F : 0, L = H >= 300 && H < 400, G = O(T, "location");
      if (L && G != null) {
        if (M > this.maxRedirects) {
          k(this.createMaxRedirectError());
          return;
        }
        this.doApiRequest(p.prepareRedirectUrlOptions(G, N), w, U, M).then(q).catch(k);
        return;
      }
      T.setEncoding("utf8");
      let X = "";
      T.on("error", k), T.on("data", (ee) => X += ee), T.on("end", () => {
        try {
          if (T.statusCode != null && T.statusCode >= 400) {
            const ee = O(T, "content-type"), he = ee != null && (Array.isArray(ee) ? ee.find((Z) => Z.includes("json")) != null : ee.includes("json"));
            k(l(T, `method: ${N.method || "GET"} url: ${N.protocol || "https:"}//${N.hostname}${N.port ? `:${N.port}` : ""}${N.path}

          Data:
          ${he ? JSON.stringify(JSON.parse(X)) : X}
          `));
          } else
            q(X.length === 0 ? null : X);
        } catch (ee) {
          k(ee);
        }
      });
    }
    async downloadToBuffer(T, N) {
      return await N.cancellationToken.createPromise((w, q, k) => {
        const M = [], U = {
          headers: N.headers || void 0,
          // because PrivateGitHubProvider requires HttpExecutor.prepareRedirectUrlOptions logic, so, we need to redirect manually
          redirect: "manual"
        };
        m(T, U), b(U), this.doDownload(U, {
          destination: null,
          options: N,
          onCancel: k,
          callback: (F) => {
            F == null ? w(Buffer.concat(M)) : q(F);
          },
          responseHandler: (F, H) => {
            let L = 0;
            F.on("data", (G) => {
              if (L += G.length, L > 524288e3) {
                H(new Error("Maximum allowed size is 500 MB"));
                return;
              }
              M.push(G);
            }), F.on("end", () => {
              H(null);
            });
          }
        }, 0);
      });
    }
    doDownload(T, N, w) {
      const q = this.createRequest(T, (k) => {
        if (k.statusCode >= 400) {
          N.callback(new Error(`Cannot download "${T.protocol || "https:"}//${T.hostname}${T.path}", status ${k.statusCode}: ${k.statusMessage}`));
          return;
        }
        k.on("error", N.callback);
        const M = O(k, "location");
        if (M != null) {
          w < this.maxRedirects ? this.doDownload(p.prepareRedirectUrlOptions(M, T), N, w++) : N.callback(this.createMaxRedirectError());
          return;
        }
        N.responseHandler == null ? I(N, k) : N.responseHandler(k, N.callback);
      });
      this.addErrorAndTimeoutHandlers(q, N.callback, T.timeout), this.addRedirectHandlers(q, T, N.callback, w, (k) => {
        this.doDownload(k, N, w++);
      }), q.end();
    }
    createMaxRedirectError() {
      return new Error(`Too many redirects (> ${this.maxRedirects})`);
    }
    addTimeOutHandler(T, N, w) {
      T.on("socket", (q) => {
        q.setTimeout(w, () => {
          T.abort(), N(new Error("Request timed out"));
        });
      });
    }
    static prepareRedirectUrlOptions(T, N) {
      const w = v(T, { ...N }), q = w.headers;
      if (q?.authorization) {
        const k = p.reconstructOriginalUrl(N), M = E(T, N);
        p.isCrossOriginRedirect(k, M) && (a.enabled && a(`Given the cross-origin redirect (from ${k.host} to ${M.host}), the Authorization header will be stripped out.`), delete q.authorization);
      }
      return w;
    }
    static reconstructOriginalUrl(T) {
      const N = T.protocol || "https:";
      if (!T.hostname)
        throw new Error("Missing hostname in request options");
      const w = T.hostname, q = T.port ? `:${T.port}` : "", k = T.path || "/";
      return new d.URL(`${N}//${w}${q}${k}`);
    }
    static isCrossOriginRedirect(T, N) {
      if (T.hostname.toLowerCase() !== N.hostname.toLowerCase())
        return !0;
      if (T.protocol === "http:" && // This can be replaced with `!originalUrl.port`, but for the sake of clarity.
      ["80", ""].includes(T.port) && N.protocol === "https:" && // This can be replaced with `!redirectUrl.port`, but for the sake of clarity.
      ["443", ""].includes(N.port))
        return !1;
      if (T.protocol !== N.protocol)
        return !0;
      const w = T.port, q = N.port;
      return w !== q;
    }
    static retryOnServerError(T, N = 3) {
      for (let w = 0; ; w++)
        try {
          return T();
        } catch (q) {
          if (w < N && (q instanceof r && q.isServerError() || q.code === "EPIPE"))
            continue;
          throw q;
        }
    }
  }
  We.HttpExecutor = p;
  function E(C, T) {
    try {
      return new d.URL(C);
    } catch {
      const N = T.hostname, w = T.protocol || "https:", q = T.port ? `:${T.port}` : "", k = `${w}//${N}${q}`;
      return new d.URL(C, k);
    }
  }
  function v(C, T) {
    const N = b(T), w = E(C, T);
    return m(w, N), N;
  }
  function m(C, T) {
    T.protocol = C.protocol, T.hostname = C.hostname, C.port ? T.port = C.port : T.port && delete T.port, T.path = C.pathname + C.search;
  }
  class _ extends u.Transform {
    // noinspection JSUnusedGlobalSymbols
    get actual() {
      return this._actual;
    }
    constructor(T, N = "sha512", w = "base64") {
      super(), this.expected = T, this.algorithm = N, this.encoding = w, this._actual = null, this.isValidateOnEnd = !0, this.digester = (0, e.createHash)(N);
    }
    // noinspection JSUnusedGlobalSymbols
    _transform(T, N, w) {
      this.digester.update(T), w(null, T);
    }
    // noinspection JSUnusedGlobalSymbols
    _flush(T) {
      if (this._actual = this.digester.digest(this.encoding), this.isValidateOnEnd)
        try {
          this.validate();
        } catch (N) {
          T(N);
          return;
        }
      T(null);
    }
    validate() {
      if (this._actual == null)
        throw (0, o.newError)("Not finished yet", "ERR_STREAM_NOT_FINISHED");
      if (this._actual !== this.expected)
        throw (0, o.newError)(`${this.algorithm} checksum mismatch, expected ${this.expected}, got ${this._actual}`, "ERR_CHECKSUM_MISMATCH");
      return null;
    }
  }
  We.DigestTransform = _;
  function R(C, T, N) {
    return C != null && T != null && C !== T ? (N(new Error(`checksum mismatch: expected ${T} but got ${C} (X-Checksum-Sha2 header)`)), !1) : !0;
  }
  function O(C, T) {
    const N = C.headers[T];
    return N == null ? null : Array.isArray(N) ? N.length === 0 ? null : N[N.length - 1] : N;
  }
  function I(C, T) {
    if (!R(O(T, "X-Checksum-Sha2"), C.options.sha2, C.callback))
      return;
    const N = [];
    if (C.options.onProgress != null) {
      const M = O(T, "content-length");
      M != null && N.push(new c.ProgressCallbackTransform(parseInt(M, 10), C.options.cancellationToken, C.options.onProgress));
    }
    const w = C.options.sha512;
    w != null ? N.push(new _(w, "sha512", w.length === 128 && !w.includes("+") && !w.includes("Z") && !w.includes("=") ? "hex" : "base64")) : C.options.sha2 != null && N.push(new _(C.options.sha2, "sha256", "hex"));
    const q = (0, h.createWriteStream)(C.destination);
    N.push(q);
    let k = T;
    for (const M of N)
      M.on("error", (U) => {
        q.close(), C.options.cancellationToken.cancelled || C.callback(U);
      }), k = k.pipe(M);
    q.on("finish", () => {
      q.close(C.callback);
    });
  }
  function b(C, T, N) {
    N != null && (C.method = N), C.headers = { ...C.headers };
    const w = C.headers;
    return T != null && (w.authorization = T.startsWith("Basic") || T.startsWith("Bearer") ? T : `token ${T}`), w["User-Agent"] == null && (w["User-Agent"] = "electron-builder"), (N == null || N === "GET" || w["Cache-Control"] == null) && (w["Cache-Control"] = "no-cache"), C.protocol == null && process.versions.electron != null && (C.protocol = "https:"), C;
  }
  function P(C, T) {
    return JSON.stringify(C, (N, w) => N.endsWith("Authorization") || N.endsWith("authorization") || N.endsWith("Password") || N.endsWith("PASSWORD") || N.endsWith("Token") || N.includes("password") || N.includes("token") || T != null && T.has(N) ? "<stripped sensitive data>" : w, 2);
  }
  return We;
}
var ir = {}, Ma;
function Of() {
  if (Ma) return ir;
  Ma = 1, Object.defineProperty(ir, "__esModule", { value: !0 }), ir.MemoLazy = void 0;
  let e = class {
    constructor(u, d) {
      this.selector = u, this.creator = d, this.selected = void 0, this._value = void 0;
    }
    get hasValue() {
      return this._value !== void 0;
    }
    get value() {
      const u = this.selector();
      if (this._value !== void 0 && n(this.selected, u))
        return this._value;
      this.selected = u;
      const d = this.creator(u);
      return this.value = d, d;
    }
    set value(u) {
      this._value = u;
    }
  };
  ir.MemoLazy = e;
  function n(h, u) {
    if (typeof h == "object" && h !== null && (typeof u == "object" && u !== null)) {
      const o = Object.keys(h), c = Object.keys(u);
      return o.length === c.length && o.every((a) => n(h[a], u[a]));
    }
    return h === u;
  }
  return ir;
}
var Ht = {}, Ba;
function Nf() {
  if (Ba) return Ht;
  Ba = 1, Object.defineProperty(Ht, "__esModule", { value: !0 }), Ht.githubUrl = e, Ht.githubTagPrefix = n, Ht.getS3LikeProviderBaseUrl = h;
  function e(o, c = "github.com") {
    return `${o.protocol || "https"}://${o.host || c}`;
  }
  function n(o) {
    var c;
    return o.tagNamePrefix ? o.tagNamePrefix : !((c = o.vPrefixedTagName) !== null && c !== void 0) || c ? "v" : "";
  }
  function h(o) {
    const c = o.provider;
    if (c === "s3")
      return u(o);
    if (c === "spaces")
      return f(o);
    throw new Error(`Not supported provider: ${c}`);
  }
  function u(o) {
    let c;
    if (o.accelerate == !0)
      c = `https://${o.bucket}.s3-accelerate.amazonaws.com`;
    else if (o.endpoint != null)
      c = `${o.endpoint}/${o.bucket}`;
    else if (o.bucket.includes(".")) {
      if (o.region == null)
        throw new Error(`Bucket name "${o.bucket}" includes a dot, but S3 region is missing`);
      o.region === "us-east-1" ? c = `https://s3.amazonaws.com/${o.bucket}` : c = `https://s3-${o.region}.amazonaws.com/${o.bucket}`;
    } else o.region === "cn-north-1" ? c = `https://${o.bucket}.s3.${o.region}.amazonaws.com.cn` : c = `https://${o.bucket}.s3.amazonaws.com`;
    return d(c, o.path);
  }
  function d(o, c) {
    return c != null && c.length > 0 && (c.startsWith("/") || (o += "/"), o += c), o;
  }
  function f(o) {
    if (o.name == null)
      throw new Error("name is missing");
    if (o.region == null)
      throw new Error("region is missing");
    return d(`https://${o.name}.${o.region}.digitaloceanspaces.com`, o.path);
  }
  return Ht;
}
var Wr = {}, ja;
function Pf() {
  if (ja) return Wr;
  ja = 1, Object.defineProperty(Wr, "__esModule", { value: !0 }), Wr.retry = n;
  const e = Ao();
  async function n(h, u) {
    var d;
    const { retries: f, interval: o, backoff: c = 0, attempt: a = 0, shouldRetry: l, cancellationToken: s = new e.CancellationToken() } = u;
    try {
      return await h();
    } catch (r) {
      if (await Promise.resolve((d = l?.(r)) !== null && d !== void 0 ? d : !0) && f > 0 && !s.cancelled)
        return await new Promise((i) => setTimeout(i, o + c * a)), await n(h, { ...u, retries: f - 1, attempt: a + 1 });
      throw r;
    }
  }
  return Wr;
}
var Vr = {}, Ha;
function Df() {
  if (Ha) return Vr;
  Ha = 1, Object.defineProperty(Vr, "__esModule", { value: !0 }), Vr.parseDn = e;
  function e(n) {
    let h = !1, u = null, d = "", f = 0;
    n = n.trim();
    const o = /* @__PURE__ */ new Map();
    for (let c = 0; c <= n.length; c++) {
      if (c === n.length) {
        u !== null && o.set(u, d);
        break;
      }
      const a = n[c];
      if (h) {
        if (a === '"') {
          h = !1;
          continue;
        }
      } else {
        if (a === '"') {
          h = !0;
          continue;
        }
        if (a === "\\") {
          c++;
          const l = parseInt(n.slice(c, c + 2), 16);
          Number.isNaN(l) ? d += n[c] : (c++, d += String.fromCharCode(l));
          continue;
        }
        if (u === null && a === "=") {
          u = d, d = "";
          continue;
        }
        if (a === "," || a === ";" || a === "+") {
          u !== null && o.set(u, d), u = null, d = "";
          continue;
        }
      }
      if (a === " " && !h) {
        if (d.length === 0)
          continue;
        if (c > f) {
          let l = c;
          for (; n[l] === " "; )
            l++;
          f = l;
        }
        if (f >= n.length || n[f] === "," || n[f] === ";" || u === null && n[f] === "=" || u !== null && n[f] === "+") {
          c = f - 1;
          continue;
        }
      }
      d += a;
    }
    return o;
  }
  return Vr;
}
var Pt = {}, Ga;
function If() {
  if (Ga) return Pt;
  Ga = 1, Object.defineProperty(Pt, "__esModule", { value: !0 }), Pt.nil = Pt.UUID = void 0;
  const e = Or, n = rn(), h = "options.name must be either a string or a Buffer", u = (0, e.randomBytes)(16);
  u[0] = u[0] | 1;
  const d = {}, f = [];
  for (let r = 0; r < 256; r++) {
    const i = (r + 256).toString(16).substr(1);
    d[i] = r, f[r] = i;
  }
  class o {
    constructor(i) {
      this.ascii = null, this.binary = null;
      const p = o.check(i);
      if (!p)
        throw new Error("not a UUID");
      this.version = p.version, p.format === "ascii" ? this.ascii = i : this.binary = i;
    }
    static v5(i, p) {
      return l(i, "sha1", 80, p);
    }
    toString() {
      return this.ascii == null && (this.ascii = s(this.binary)), this.ascii;
    }
    inspect() {
      return `UUID v${this.version} ${this.toString()}`;
    }
    static check(i, p = 0) {
      if (typeof i == "string")
        return i = i.toLowerCase(), /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-([a-f0-9]{12})$/.test(i) ? i === "00000000-0000-0000-0000-000000000000" ? { version: void 0, variant: "nil", format: "ascii" } : {
          version: (d[i[14] + i[15]] & 240) >> 4,
          variant: c((d[i[19] + i[20]] & 224) >> 5),
          format: "ascii"
        } : !1;
      if (Buffer.isBuffer(i)) {
        if (i.length < p + 16)
          return !1;
        let E = 0;
        for (; E < 16 && i[p + E] === 0; E++)
          ;
        return E === 16 ? { version: void 0, variant: "nil", format: "binary" } : {
          version: (i[p + 6] & 240) >> 4,
          variant: c((i[p + 8] & 224) >> 5),
          format: "binary"
        };
      }
      throw (0, n.newError)("Unknown type of uuid", "ERR_UNKNOWN_UUID_TYPE");
    }
    // read stringified uuid into a Buffer
    static parse(i) {
      const p = Buffer.allocUnsafe(16);
      let E = 0;
      for (let v = 0; v < 16; v++)
        p[v] = d[i[E++] + i[E++]], (v === 3 || v === 5 || v === 7 || v === 9) && (E += 1);
      return p;
    }
  }
  Pt.UUID = o, o.OID = o.parse("6ba7b812-9dad-11d1-80b4-00c04fd430c8");
  function c(r) {
    switch (r) {
      case 0:
      case 1:
      case 3:
        return "ncs";
      case 4:
      case 5:
        return "rfc4122";
      case 6:
        return "microsoft";
      default:
        return "future";
    }
  }
  var a;
  (function(r) {
    r[r.ASCII = 0] = "ASCII", r[r.BINARY = 1] = "BINARY", r[r.OBJECT = 2] = "OBJECT";
  })(a || (a = {}));
  function l(r, i, p, E, v = a.ASCII) {
    const m = (0, e.createHash)(i);
    if (typeof r != "string" && !Buffer.isBuffer(r))
      throw (0, n.newError)(h, "ERR_INVALID_UUID_NAME");
    m.update(E), m.update(r);
    const R = m.digest();
    let O;
    switch (v) {
      case a.BINARY:
        R[6] = R[6] & 15 | p, R[8] = R[8] & 63 | 128, O = R;
        break;
      case a.OBJECT:
        R[6] = R[6] & 15 | p, R[8] = R[8] & 63 | 128, O = new o(R);
        break;
      default:
        O = f[R[0]] + f[R[1]] + f[R[2]] + f[R[3]] + "-" + f[R[4]] + f[R[5]] + "-" + f[R[6] & 15 | p] + f[R[7]] + "-" + f[R[8] & 63 | 128] + f[R[9]] + "-" + f[R[10]] + f[R[11]] + f[R[12]] + f[R[13]] + f[R[14]] + f[R[15]];
        break;
    }
    return O;
  }
  function s(r) {
    return f[r[0]] + f[r[1]] + f[r[2]] + f[r[3]] + "-" + f[r[4]] + f[r[5]] + "-" + f[r[6]] + f[r[7]] + "-" + f[r[8]] + f[r[9]] + "-" + f[r[10]] + f[r[11]] + f[r[12]] + f[r[13]] + f[r[14]] + f[r[15]];
  }
  return Pt.nil = new o("00000000-0000-0000-0000-000000000000"), Pt;
}
var Gt = {}, zn = {}, Wa;
function Lf() {
  return Wa || (Wa = 1, (function(e) {
    (function(n) {
      n.parser = function(y, g) {
        return new u(y, g);
      }, n.SAXParser = u, n.SAXStream = r, n.createStream = l, n.MAX_BUFFER_LENGTH = 64 * 1024;
      var h = [
        "comment",
        "sgmlDecl",
        "textNode",
        "tagName",
        "doctype",
        "procInstName",
        "procInstBody",
        "entity",
        "attribName",
        "attribValue",
        "cdata",
        "script"
      ];
      n.EVENTS = [
        "text",
        "processinginstruction",
        "sgmldeclaration",
        "doctype",
        "comment",
        "opentagstart",
        "attribute",
        "opentag",
        "closetag",
        "opencdata",
        "cdata",
        "closecdata",
        "error",
        "end",
        "ready",
        "script",
        "opennamespace",
        "closenamespace"
      ];
      function u(y, g) {
        if (!(this instanceof u))
          return new u(y, g);
        var $ = this;
        f($), $.q = $.c = "", $.bufferCheckPosition = n.MAX_BUFFER_LENGTH, $.encoding = null, $.opt = g || {}, $.opt.lowercase = $.opt.lowercase || $.opt.lowercasetags, $.looseCase = $.opt.lowercase ? "toLowerCase" : "toUpperCase", $.opt.maxEntityCount = $.opt.maxEntityCount || 512, $.opt.maxEntityDepth = $.opt.maxEntityDepth || 4, $.entityCount = $.entityDepth = 0, $.tags = [], $.closed = $.closedRoot = $.sawRoot = !1, $.tag = $.error = null, $.strict = !!y, $.noscript = !!(y || $.opt.noscript), $.state = w.BEGIN, $.strictEntities = $.opt.strictEntities, $.ENTITIES = $.strictEntities ? Object.create(n.XML_ENTITIES) : Object.create(n.ENTITIES), $.attribList = [], $.opt.xmlns && ($.ns = Object.create(m)), $.opt.unquotedAttributeValues === void 0 && ($.opt.unquotedAttributeValues = !y), $.trackPosition = $.opt.position !== !1, $.trackPosition && ($.position = $.line = $.column = 0), k($, "onready");
      }
      Object.create || (Object.create = function(y) {
        function g() {
        }
        g.prototype = y;
        var $ = new g();
        return $;
      }), Object.keys || (Object.keys = function(y) {
        var g = [];
        for (var $ in y) y.hasOwnProperty($) && g.push($);
        return g;
      });
      function d(y) {
        for (var g = Math.max(n.MAX_BUFFER_LENGTH, 10), $ = 0, D = 0, ye = h.length; D < ye; D++) {
          var we = y[h[D]].length;
          if (we > g)
            switch (h[D]) {
              case "textNode":
                G(y);
                break;
              case "cdata":
                L(y, "oncdata", y.cdata), y.cdata = "";
                break;
              case "script":
                L(y, "onscript", y.script), y.script = "";
                break;
              default:
                ee(y, "Max buffer length exceeded: " + h[D]);
            }
          $ = Math.max($, we);
        }
        var Pe = n.MAX_BUFFER_LENGTH - $;
        y.bufferCheckPosition = Pe + y.position;
      }
      function f(y) {
        for (var g = 0, $ = h.length; g < $; g++)
          y[h[g]] = "";
      }
      function o(y) {
        G(y), y.cdata !== "" && (L(y, "oncdata", y.cdata), y.cdata = ""), y.script !== "" && (L(y, "onscript", y.script), y.script = "");
      }
      u.prototype = {
        end: function() {
          he(this);
        },
        write: _e,
        resume: function() {
          return this.error = null, this;
        },
        close: function() {
          return this.write(null);
        },
        flush: function() {
          o(this);
        }
      };
      var c;
      try {
        c = require("stream").Stream;
      } catch {
        c = function() {
        };
      }
      c || (c = function() {
      });
      var a = n.EVENTS.filter(function(y) {
        return y !== "error" && y !== "end";
      });
      function l(y, g) {
        return new r(y, g);
      }
      function s(y, g) {
        if (y.length >= 2) {
          if (y[0] === 255 && y[1] === 254)
            return "utf-16le";
          if (y[0] === 254 && y[1] === 255)
            return "utf-16be";
        }
        return y.length >= 3 && y[0] === 239 && y[1] === 187 && y[2] === 191 ? "utf8" : y.length >= 4 ? y[0] === 60 && y[1] === 0 && y[2] === 63 && y[3] === 0 ? "utf-16le" : y[0] === 0 && y[1] === 60 && y[2] === 0 && y[3] === 63 ? "utf-16be" : "utf8" : g ? "utf8" : null;
      }
      function r(y, g) {
        if (!(this instanceof r))
          return new r(y, g);
        c.apply(this), this._parser = new u(y, g), this.writable = !0, this.readable = !0;
        var $ = this;
        this._parser.onend = function() {
          $.emit("end");
        }, this._parser.onerror = function(D) {
          $.emit("error", D), $._parser.error = null;
        }, this._decoder = null, this._decoderBuffer = null, a.forEach(function(D) {
          Object.defineProperty($, "on" + D, {
            get: function() {
              return $._parser["on" + D];
            },
            set: function(ye) {
              if (!ye)
                return $.removeAllListeners(D), $._parser["on" + D] = ye, ye;
              $.on(D, ye);
            },
            enumerable: !0,
            configurable: !1
          });
        });
      }
      r.prototype = Object.create(c.prototype, {
        constructor: {
          value: r
        }
      }), r.prototype._decodeBuffer = function(y, g) {
        if (this._decoderBuffer && (y = Buffer.concat([this._decoderBuffer, y]), this._decoderBuffer = null), !this._decoder) {
          var $ = s(y, g);
          if (!$)
            return this._decoderBuffer = y, "";
          this._parser.encoding = $, this._decoder = new TextDecoder($);
        }
        return this._decoder.decode(y, { stream: !g });
      }, r.prototype.write = function(y) {
        if (typeof Buffer == "function" && typeof Buffer.isBuffer == "function" && Buffer.isBuffer(y))
          y = this._decodeBuffer(y, !1);
        else if (this._decoderBuffer) {
          var g = this._decodeBuffer(Buffer.alloc(0), !0);
          g && (this._parser.write(g), this.emit("data", g));
        }
        return this._parser.write(y.toString()), this.emit("data", y), !0;
      }, r.prototype.end = function(y) {
        if (y && y.length && this.write(y), this._decoderBuffer) {
          var g = this._decodeBuffer(Buffer.alloc(0), !0);
          g && (this._parser.write(g), this.emit("data", g));
        } else if (this._decoder) {
          var $ = this._decoder.decode();
          $ && (this._parser.write($), this.emit("data", $));
        }
        return this._parser.end(), !0;
      }, r.prototype.on = function(y, g) {
        var $ = this;
        return !$._parser["on" + y] && a.indexOf(y) !== -1 && ($._parser["on" + y] = function() {
          var D = arguments.length === 1 ? [arguments[0]] : Array.apply(null, arguments);
          D.splice(0, 0, y), $.emit.apply($, D);
        }), c.prototype.on.call($, y, g);
      };
      var i = "[CDATA[", p = "DOCTYPE", E = "http://www.w3.org/XML/1998/namespace", v = "http://www.w3.org/2000/xmlns/", m = { xml: E, xmlns: v }, _ = /[:_A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD]/, R = /[:_A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\u00B7\u0300-\u036F\u203F-\u2040.\d-]/, O = /[#:_A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD]/, I = /[#:_A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\u00B7\u0300-\u036F\u203F-\u2040.\d-]/;
      function b(y) {
        return y === " " || y === `
` || y === "\r" || y === "	";
      }
      function P(y) {
        return y === '"' || y === "'";
      }
      function C(y) {
        return y === ">" || b(y);
      }
      function T(y, g) {
        return y.test(g);
      }
      function N(y, g) {
        return !T(y, g);
      }
      var w = 0;
      n.STATE = {
        BEGIN: w++,
        // leading byte order mark or whitespace
        BEGIN_WHITESPACE: w++,
        // leading whitespace
        TEXT: w++,
        // general stuff
        TEXT_ENTITY: w++,
        // &amp and such.
        OPEN_WAKA: w++,
        // <
        SGML_DECL: w++,
        // <!BLARG
        SGML_DECL_QUOTED: w++,
        // <!BLARG foo "bar
        DOCTYPE: w++,
        // <!DOCTYPE
        DOCTYPE_QUOTED: w++,
        // <!DOCTYPE "//blah
        DOCTYPE_DTD: w++,
        // <!DOCTYPE "//blah" [ ...
        DOCTYPE_DTD_QUOTED: w++,
        // <!DOCTYPE "//blah" [ "foo
        COMMENT_STARTING: w++,
        // <!-
        COMMENT: w++,
        // <!--
        COMMENT_ENDING: w++,
        // <!-- blah -
        COMMENT_ENDED: w++,
        // <!-- blah --
        CDATA: w++,
        // <![CDATA[ something
        CDATA_ENDING: w++,
        // ]
        CDATA_ENDING_2: w++,
        // ]]
        PROC_INST: w++,
        // <?hi
        PROC_INST_BODY: w++,
        // <?hi there
        PROC_INST_ENDING: w++,
        // <?hi "there" ?
        OPEN_TAG: w++,
        // <strong
        OPEN_TAG_SLASH: w++,
        // <strong /
        ATTRIB: w++,
        // <a
        ATTRIB_NAME: w++,
        // <a foo
        ATTRIB_NAME_SAW_WHITE: w++,
        // <a foo _
        ATTRIB_VALUE: w++,
        // <a foo=
        ATTRIB_VALUE_QUOTED: w++,
        // <a foo="bar
        ATTRIB_VALUE_CLOSED: w++,
        // <a foo="bar"
        ATTRIB_VALUE_UNQUOTED: w++,
        // <a foo=bar
        ATTRIB_VALUE_ENTITY_Q: w++,
        // <foo bar="&quot;"
        ATTRIB_VALUE_ENTITY_U: w++,
        // <foo bar=&quot
        CLOSE_TAG: w++,
        // </a
        CLOSE_TAG_SAW_WHITE: w++,
        // </a   >
        SCRIPT: w++,
        // <script> ...
        SCRIPT_ENDING: w++
        // <script> ... <
      }, n.XML_ENTITIES = {
        amp: "&",
        gt: ">",
        lt: "<",
        quot: '"',
        apos: "'"
      }, n.ENTITIES = {
        amp: "&",
        gt: ">",
        lt: "<",
        quot: '"',
        apos: "'",
        AElig: 198,
        Aacute: 193,
        Acirc: 194,
        Agrave: 192,
        Aring: 197,
        Atilde: 195,
        Auml: 196,
        Ccedil: 199,
        ETH: 208,
        Eacute: 201,
        Ecirc: 202,
        Egrave: 200,
        Euml: 203,
        Iacute: 205,
        Icirc: 206,
        Igrave: 204,
        Iuml: 207,
        Ntilde: 209,
        Oacute: 211,
        Ocirc: 212,
        Ograve: 210,
        Oslash: 216,
        Otilde: 213,
        Ouml: 214,
        THORN: 222,
        Uacute: 218,
        Ucirc: 219,
        Ugrave: 217,
        Uuml: 220,
        Yacute: 221,
        aacute: 225,
        acirc: 226,
        aelig: 230,
        agrave: 224,
        aring: 229,
        atilde: 227,
        auml: 228,
        ccedil: 231,
        eacute: 233,
        ecirc: 234,
        egrave: 232,
        eth: 240,
        euml: 235,
        iacute: 237,
        icirc: 238,
        igrave: 236,
        iuml: 239,
        ntilde: 241,
        oacute: 243,
        ocirc: 244,
        ograve: 242,
        oslash: 248,
        otilde: 245,
        ouml: 246,
        szlig: 223,
        thorn: 254,
        uacute: 250,
        ucirc: 251,
        ugrave: 249,
        uuml: 252,
        yacute: 253,
        yuml: 255,
        copy: 169,
        reg: 174,
        nbsp: 160,
        iexcl: 161,
        cent: 162,
        pound: 163,
        curren: 164,
        yen: 165,
        brvbar: 166,
        sect: 167,
        uml: 168,
        ordf: 170,
        laquo: 171,
        not: 172,
        shy: 173,
        macr: 175,
        deg: 176,
        plusmn: 177,
        sup1: 185,
        sup2: 178,
        sup3: 179,
        acute: 180,
        micro: 181,
        para: 182,
        middot: 183,
        cedil: 184,
        ordm: 186,
        raquo: 187,
        frac14: 188,
        frac12: 189,
        frac34: 190,
        iquest: 191,
        times: 215,
        divide: 247,
        OElig: 338,
        oelig: 339,
        Scaron: 352,
        scaron: 353,
        Yuml: 376,
        fnof: 402,
        circ: 710,
        tilde: 732,
        Alpha: 913,
        Beta: 914,
        Gamma: 915,
        Delta: 916,
        Epsilon: 917,
        Zeta: 918,
        Eta: 919,
        Theta: 920,
        Iota: 921,
        Kappa: 922,
        Lambda: 923,
        Mu: 924,
        Nu: 925,
        Xi: 926,
        Omicron: 927,
        Pi: 928,
        Rho: 929,
        Sigma: 931,
        Tau: 932,
        Upsilon: 933,
        Phi: 934,
        Chi: 935,
        Psi: 936,
        Omega: 937,
        alpha: 945,
        beta: 946,
        gamma: 947,
        delta: 948,
        epsilon: 949,
        zeta: 950,
        eta: 951,
        theta: 952,
        iota: 953,
        kappa: 954,
        lambda: 955,
        mu: 956,
        nu: 957,
        xi: 958,
        omicron: 959,
        pi: 960,
        rho: 961,
        sigmaf: 962,
        sigma: 963,
        tau: 964,
        upsilon: 965,
        phi: 966,
        chi: 967,
        psi: 968,
        omega: 969,
        thetasym: 977,
        upsih: 978,
        piv: 982,
        ensp: 8194,
        emsp: 8195,
        thinsp: 8201,
        zwnj: 8204,
        zwj: 8205,
        lrm: 8206,
        rlm: 8207,
        ndash: 8211,
        mdash: 8212,
        lsquo: 8216,
        rsquo: 8217,
        sbquo: 8218,
        ldquo: 8220,
        rdquo: 8221,
        bdquo: 8222,
        dagger: 8224,
        Dagger: 8225,
        bull: 8226,
        hellip: 8230,
        permil: 8240,
        prime: 8242,
        Prime: 8243,
        lsaquo: 8249,
        rsaquo: 8250,
        oline: 8254,
        frasl: 8260,
        euro: 8364,
        image: 8465,
        weierp: 8472,
        real: 8476,
        trade: 8482,
        alefsym: 8501,
        larr: 8592,
        uarr: 8593,
        rarr: 8594,
        darr: 8595,
        harr: 8596,
        crarr: 8629,
        lArr: 8656,
        uArr: 8657,
        rArr: 8658,
        dArr: 8659,
        hArr: 8660,
        forall: 8704,
        part: 8706,
        exist: 8707,
        empty: 8709,
        nabla: 8711,
        isin: 8712,
        notin: 8713,
        ni: 8715,
        prod: 8719,
        sum: 8721,
        minus: 8722,
        lowast: 8727,
        radic: 8730,
        prop: 8733,
        infin: 8734,
        ang: 8736,
        and: 8743,
        or: 8744,
        cap: 8745,
        cup: 8746,
        int: 8747,
        there4: 8756,
        sim: 8764,
        cong: 8773,
        asymp: 8776,
        ne: 8800,
        equiv: 8801,
        le: 8804,
        ge: 8805,
        sub: 8834,
        sup: 8835,
        nsub: 8836,
        sube: 8838,
        supe: 8839,
        oplus: 8853,
        otimes: 8855,
        perp: 8869,
        sdot: 8901,
        lceil: 8968,
        rceil: 8969,
        lfloor: 8970,
        rfloor: 8971,
        lang: 9001,
        rang: 9002,
        loz: 9674,
        spades: 9824,
        clubs: 9827,
        hearts: 9829,
        diams: 9830
      }, Object.keys(n.ENTITIES).forEach(function(y) {
        var g = n.ENTITIES[y], $ = typeof g == "number" ? String.fromCharCode(g) : g;
        n.ENTITIES[y] = $;
      });
      for (var q in n.STATE)
        n.STATE[n.STATE[q]] = q;
      w = n.STATE;
      function k(y, g, $) {
        y[g] && y[g]($);
      }
      function M(y) {
        var g = y && y.match(/(?:^|\s)encoding\s*=\s*(['"])([^'"]+)\1/i);
        return g ? g[2] : null;
      }
      function U(y) {
        return y ? y.toLowerCase().replace(/[^a-z0-9]/g, "") : null;
      }
      function F(y, g) {
        const $ = U(y), D = U(g);
        return !$ || !D ? !0 : D === "utf16" ? $ === "utf16le" || $ === "utf16be" : $ === D;
      }
      function H(y, g) {
        if (!(!y.strict || !y.encoding || !g || g.name !== "xml")) {
          var $ = M(g.body);
          $ && !F(y.encoding, $) && Z(
            y,
            "XML declaration encoding " + $ + " does not match detected stream encoding " + y.encoding.toUpperCase()
          );
        }
      }
      function L(y, g, $) {
        y.textNode && G(y), k(y, g, $);
      }
      function G(y) {
        y.textNode = X(y.opt, y.textNode), y.textNode && k(y, "ontext", y.textNode), y.textNode = "";
      }
      function X(y, g) {
        return y.trim && (g = g.trim()), y.normalize && (g = g.replace(/\s+/g, " ")), g;
      }
      function ee(y, g) {
        return G(y), y.trackPosition && (g += `
Line: ` + y.line + `
Column: ` + y.column + `
Char: ` + y.c), g = new Error(g), y.error = g, k(y, "onerror", g), y;
      }
      function he(y) {
        return y.sawRoot && !y.closedRoot && Z(y, "Unclosed root tag"), y.state !== w.BEGIN && y.state !== w.BEGIN_WHITESPACE && y.state !== w.TEXT && ee(y, "Unexpected end"), G(y), y.c = "", y.closed = !0, k(y, "onend"), u.call(y, y.strict, y.opt), y;
      }
      function Z(y, g) {
        if (typeof y != "object" || !(y instanceof u))
          throw new Error("bad call to strictFail");
        y.strict && ee(y, g);
      }
      function ge(y) {
        y.strict || (y.tagName = y.tagName[y.looseCase]());
        var g = y.tags[y.tags.length - 1] || y, $ = y.tag = { name: y.tagName, attributes: {} };
        y.opt.xmlns && ($.ns = g.ns), y.attribList.length = 0, L(y, "onopentagstart", $);
      }
      function pe(y, g) {
        var $ = y.indexOf(":"), D = $ < 0 ? ["", y] : y.split(":"), ye = D[0], we = D[1];
        return g && y === "xmlns" && (ye = "xmlns", we = ""), { prefix: ye, local: we };
      }
      function Q(y) {
        if (y.strict || (y.attribName = y.attribName[y.looseCase]()), y.attribList.indexOf(y.attribName) !== -1 || y.tag.attributes.hasOwnProperty(y.attribName)) {
          y.attribName = y.attribValue = "";
          return;
        }
        if (y.opt.xmlns) {
          var g = pe(y.attribName, !0), $ = g.prefix, D = g.local;
          if ($ === "xmlns")
            if (D === "xml" && y.attribValue !== E)
              Z(
                y,
                "xml: prefix must be bound to " + E + `
Actual: ` + y.attribValue
              );
            else if (D === "xmlns" && y.attribValue !== v)
              Z(
                y,
                "xmlns: prefix must be bound to " + v + `
Actual: ` + y.attribValue
              );
            else {
              var ye = y.tag, we = y.tags[y.tags.length - 1] || y;
              ye.ns === we.ns && (ye.ns = Object.create(we.ns)), ye.ns[D] = y.attribValue;
            }
          y.attribList.push([y.attribName, y.attribValue]);
        } else
          y.tag.attributes[y.attribName] = y.attribValue, L(y, "onattribute", {
            name: y.attribName,
            value: y.attribValue
          });
        y.attribName = y.attribValue = "";
      }
      function ce(y, g) {
        if (y.opt.xmlns) {
          var $ = y.tag, D = pe(y.tagName);
          $.prefix = D.prefix, $.local = D.local, $.uri = $.ns[D.prefix] || "", $.prefix && !$.uri && (Z(
            y,
            "Unbound namespace prefix: " + JSON.stringify(y.tagName)
          ), $.uri = D.prefix);
          var ye = y.tags[y.tags.length - 1] || y;
          $.ns && ye.ns !== $.ns && Object.keys($.ns).forEach(function(ne) {
            L(y, "onopennamespace", {
              prefix: ne,
              uri: $.ns[ne]
            });
          });
          for (var we = 0, Pe = y.attribList.length; we < Pe; we++) {
            var xe = y.attribList[we], ke = xe[0], He = xe[1], t = pe(ke, !0), B = t.prefix, W = t.local, ie = B === "" ? "" : $.ns[B] || "", V = {
              name: ke,
              value: He,
              prefix: B,
              local: W,
              uri: ie
            };
            B && B !== "xmlns" && !ie && (Z(
              y,
              "Unbound namespace prefix: " + JSON.stringify(B)
            ), V.uri = B), y.tag.attributes[ke] = V, L(y, "onattribute", V);
          }
          y.attribList.length = 0;
        }
        y.tag.isSelfClosing = !!g, y.sawRoot = !0, y.tags.push(y.tag), L(y, "onopentag", y.tag), g || (!y.noscript && y.tagName.toLowerCase() === "script" ? y.state = w.SCRIPT : y.state = w.TEXT, y.tag = null, y.tagName = ""), y.attribName = y.attribValue = "", y.attribList.length = 0;
      }
      function Ee(y) {
        if (!y.tagName) {
          Z(y, "Weird empty close tag."), y.textNode += "</>", y.state = w.TEXT;
          return;
        }
        if (y.script) {
          if (y.tagName !== "script") {
            y.script += "</" + y.tagName + ">", y.tagName = "", y.state = w.SCRIPT;
            return;
          }
          L(y, "onscript", y.script), y.script = "";
        }
        var g = y.tags.length, $ = y.tagName;
        y.strict || ($ = $[y.looseCase]());
        for (var D = $; g--; ) {
          var ye = y.tags[g];
          if (ye.name !== D)
            Z(y, "Unexpected close tag");
          else
            break;
        }
        if (g < 0) {
          Z(y, "Unmatched closing tag: " + y.tagName), y.textNode += "</" + y.tagName + ">", y.state = w.TEXT;
          return;
        }
        y.tagName = $;
        for (var we = y.tags.length; we-- > g; ) {
          var Pe = y.tag = y.tags.pop();
          y.tagName = y.tag.name, L(y, "onclosetag", y.tagName);
          var xe = {};
          for (var ke in Pe.ns)
            xe[ke] = Pe.ns[ke];
          var He = y.tags[y.tags.length - 1] || y;
          y.opt.xmlns && Pe.ns !== He.ns && Object.keys(Pe.ns).forEach(function(t) {
            var B = Pe.ns[t];
            L(y, "onclosenamespace", { prefix: t, uri: B });
          });
        }
        g === 0 && (y.closedRoot = !0), y.tagName = y.attribValue = y.attribName = "", y.attribList.length = 0, y.state = w.TEXT;
      }
      function Te(y) {
        var g = y.entity, $ = g.toLowerCase(), D, ye = "";
        return y.ENTITIES[g] ? y.ENTITIES[g] : y.ENTITIES[$] ? y.ENTITIES[$] : (g = $, g.charAt(0) === "#" && (g.charAt(1) === "x" ? (g = g.slice(2), D = parseInt(g, 16), ye = D.toString(16)) : (g = g.slice(1), D = parseInt(g, 10), ye = D.toString(10))), g = g.replace(/^0+/, ""), isNaN(D) || ye.toLowerCase() !== g || D < 0 || D > 1114111 ? (Z(y, "Invalid character entity"), "&" + y.entity + ";") : String.fromCodePoint(D));
      }
      function Oe(y, g) {
        g === "<" ? (y.state = w.OPEN_WAKA, y.startTagPosition = y.position) : b(g) || (Z(y, "Non-whitespace before first tag."), y.textNode = g, y.state = w.TEXT);
      }
      function Ce(y, g) {
        var $ = "";
        return g < y.length && ($ = y.charAt(g)), $;
      }
      function _e(y) {
        var g = this;
        if (this.error)
          throw this.error;
        if (g.closed)
          return ee(
            g,
            "Cannot write after close. Assign an onready handler."
          );
        if (y === null)
          return he(g);
        typeof y == "object" && (y = y.toString());
        for (var $ = 0, D = ""; D = Ce(y, $++), g.c = D, !!D; )
          switch (g.trackPosition && (g.position++, D === `
` ? (g.line++, g.column = 0) : g.column++), g.state) {
            case w.BEGIN:
              if (g.state = w.BEGIN_WHITESPACE, D === "\uFEFF")
                continue;
              Oe(g, D);
              continue;
            case w.BEGIN_WHITESPACE:
              Oe(g, D);
              continue;
            case w.TEXT:
              if (g.sawRoot && !g.closedRoot) {
                for (var we = $ - 1; D && D !== "<" && D !== "&"; )
                  D = Ce(y, $++), D && g.trackPosition && (g.position++, D === `
` ? (g.line++, g.column = 0) : g.column++);
                g.textNode += y.substring(we, $ - 1);
              }
              D === "<" && !(g.sawRoot && g.closedRoot && !g.strict) ? (g.state = w.OPEN_WAKA, g.startTagPosition = g.position) : (!b(D) && (!g.sawRoot || g.closedRoot) && Z(g, "Text data outside of root node."), D === "&" ? g.state = w.TEXT_ENTITY : g.textNode += D);
              continue;
            case w.SCRIPT:
              D === "<" ? g.state = w.SCRIPT_ENDING : g.script += D;
              continue;
            case w.SCRIPT_ENDING:
              D === "/" ? g.state = w.CLOSE_TAG : (g.script += "<" + D, g.state = w.SCRIPT);
              continue;
            case w.OPEN_WAKA:
              if (D === "!")
                g.state = w.SGML_DECL, g.sgmlDecl = "";
              else if (!b(D)) if (T(_, D))
                g.state = w.OPEN_TAG, g.tagName = D;
              else if (D === "/")
                g.state = w.CLOSE_TAG, g.tagName = "";
              else if (D === "?")
                g.state = w.PROC_INST, g.procInstName = g.procInstBody = "";
              else {
                if (Z(g, "Unencoded <"), g.startTagPosition + 1 < g.position) {
                  var ye = g.position - g.startTagPosition;
                  D = new Array(ye).join(" ") + D;
                }
                g.textNode += "<" + D, g.state = w.TEXT;
              }
              continue;
            case w.SGML_DECL:
              if (g.sgmlDecl + D === "--") {
                g.state = w.COMMENT, g.comment = "", g.sgmlDecl = "";
                continue;
              }
              g.doctype && g.doctype !== !0 && g.sgmlDecl ? (g.state = w.DOCTYPE_DTD, g.doctype += "<!" + g.sgmlDecl + D, g.sgmlDecl = "") : (g.sgmlDecl + D).toUpperCase() === i ? (L(g, "onopencdata"), g.state = w.CDATA, g.sgmlDecl = "", g.cdata = "") : (g.sgmlDecl + D).toUpperCase() === p ? (g.state = w.DOCTYPE, (g.doctype || g.sawRoot) && Z(
                g,
                "Inappropriately located doctype declaration"
              ), g.doctype = "", g.sgmlDecl = "") : D === ">" ? (L(g, "onsgmldeclaration", g.sgmlDecl), g.sgmlDecl = "", g.state = w.TEXT) : (P(D) && (g.state = w.SGML_DECL_QUOTED), g.sgmlDecl += D);
              continue;
            case w.SGML_DECL_QUOTED:
              D === g.q && (g.state = w.SGML_DECL, g.q = ""), g.sgmlDecl += D;
              continue;
            case w.DOCTYPE:
              D === ">" ? (g.state = w.TEXT, L(g, "ondoctype", g.doctype), g.doctype = !0) : (g.doctype += D, D === "[" ? g.state = w.DOCTYPE_DTD : P(D) && (g.state = w.DOCTYPE_QUOTED, g.q = D));
              continue;
            case w.DOCTYPE_QUOTED:
              g.doctype += D, D === g.q && (g.q = "", g.state = w.DOCTYPE);
              continue;
            case w.DOCTYPE_DTD:
              D === "]" ? (g.doctype += D, g.state = w.DOCTYPE) : D === "<" ? (g.state = w.OPEN_WAKA, g.startTagPosition = g.position) : P(D) ? (g.doctype += D, g.state = w.DOCTYPE_DTD_QUOTED, g.q = D) : g.doctype += D;
              continue;
            case w.DOCTYPE_DTD_QUOTED:
              g.doctype += D, D === g.q && (g.state = w.DOCTYPE_DTD, g.q = "");
              continue;
            case w.COMMENT:
              D === "-" ? g.state = w.COMMENT_ENDING : g.comment += D;
              continue;
            case w.COMMENT_ENDING:
              D === "-" ? (g.state = w.COMMENT_ENDED, g.comment = X(g.opt, g.comment), g.comment && L(g, "oncomment", g.comment), g.comment = "") : (g.comment += "-" + D, g.state = w.COMMENT);
              continue;
            case w.COMMENT_ENDED:
              D !== ">" ? (Z(g, "Malformed comment"), g.comment += "--" + D, g.state = w.COMMENT) : g.doctype && g.doctype !== !0 ? g.state = w.DOCTYPE_DTD : g.state = w.TEXT;
              continue;
            case w.CDATA:
              for (var we = $ - 1; D && D !== "]"; )
                D = Ce(y, $++), D && g.trackPosition && (g.position++, D === `
` ? (g.line++, g.column = 0) : g.column++);
              g.cdata += y.substring(we, $ - 1), D === "]" && (g.state = w.CDATA_ENDING);
              continue;
            case w.CDATA_ENDING:
              D === "]" ? g.state = w.CDATA_ENDING_2 : (g.cdata += "]" + D, g.state = w.CDATA);
              continue;
            case w.CDATA_ENDING_2:
              D === ">" ? (g.cdata && L(g, "oncdata", g.cdata), L(g, "onclosecdata"), g.cdata = "", g.state = w.TEXT) : D === "]" ? g.cdata += "]" : (g.cdata += "]]" + D, g.state = w.CDATA);
              continue;
            case w.PROC_INST:
              D === "?" ? g.state = w.PROC_INST_ENDING : b(D) ? g.state = w.PROC_INST_BODY : g.procInstName += D;
              continue;
            case w.PROC_INST_BODY:
              if (!g.procInstBody && b(D))
                continue;
              D === "?" ? g.state = w.PROC_INST_ENDING : g.procInstBody += D;
              continue;
            case w.PROC_INST_ENDING:
              if (D === ">") {
                const He = {
                  name: g.procInstName,
                  body: g.procInstBody
                };
                H(g, He), L(g, "onprocessinginstruction", He), g.procInstName = g.procInstBody = "", g.state = w.TEXT;
              } else
                g.procInstBody += "?" + D, g.state = w.PROC_INST_BODY;
              continue;
            case w.OPEN_TAG:
              T(R, D) ? g.tagName += D : (ge(g), D === ">" ? ce(g) : D === "/" ? g.state = w.OPEN_TAG_SLASH : (b(D) || Z(g, "Invalid character in tag name"), g.state = w.ATTRIB));
              continue;
            case w.OPEN_TAG_SLASH:
              D === ">" ? (ce(g, !0), Ee(g)) : (Z(
                g,
                "Forward-slash in opening tag not followed by >"
              ), g.state = w.ATTRIB);
              continue;
            case w.ATTRIB:
              if (b(D))
                continue;
              D === ">" ? ce(g) : D === "/" ? g.state = w.OPEN_TAG_SLASH : T(_, D) ? (g.attribName = D, g.attribValue = "", g.state = w.ATTRIB_NAME) : Z(g, "Invalid attribute name");
              continue;
            case w.ATTRIB_NAME:
              D === "=" ? g.state = w.ATTRIB_VALUE : D === ">" ? (Z(g, "Attribute without value"), g.attribValue = g.attribName, Q(g), ce(g)) : b(D) ? g.state = w.ATTRIB_NAME_SAW_WHITE : T(R, D) ? g.attribName += D : Z(g, "Invalid attribute name");
              continue;
            case w.ATTRIB_NAME_SAW_WHITE:
              if (D === "=")
                g.state = w.ATTRIB_VALUE;
              else {
                if (b(D))
                  continue;
                Z(g, "Attribute without value"), g.tag.attributes[g.attribName] = "", g.attribValue = "", L(g, "onattribute", {
                  name: g.attribName,
                  value: ""
                }), g.attribName = "", D === ">" ? ce(g) : T(_, D) ? (g.attribName = D, g.state = w.ATTRIB_NAME) : (Z(g, "Invalid attribute name"), g.state = w.ATTRIB);
              }
              continue;
            case w.ATTRIB_VALUE:
              if (b(D))
                continue;
              P(D) ? (g.q = D, g.state = w.ATTRIB_VALUE_QUOTED) : (g.opt.unquotedAttributeValues || ee(g, "Unquoted attribute value"), g.state = w.ATTRIB_VALUE_UNQUOTED, g.attribValue = D);
              continue;
            case w.ATTRIB_VALUE_QUOTED:
              if (D !== g.q) {
                D === "&" ? g.state = w.ATTRIB_VALUE_ENTITY_Q : g.attribValue += D;
                continue;
              }
              Q(g), g.q = "", g.state = w.ATTRIB_VALUE_CLOSED;
              continue;
            case w.ATTRIB_VALUE_CLOSED:
              b(D) ? g.state = w.ATTRIB : D === ">" ? ce(g) : D === "/" ? g.state = w.OPEN_TAG_SLASH : T(_, D) ? (Z(g, "No whitespace between attributes"), g.attribName = D, g.attribValue = "", g.state = w.ATTRIB_NAME) : Z(g, "Invalid attribute name");
              continue;
            case w.ATTRIB_VALUE_UNQUOTED:
              if (!C(D)) {
                D === "&" ? g.state = w.ATTRIB_VALUE_ENTITY_U : g.attribValue += D;
                continue;
              }
              Q(g), D === ">" ? ce(g) : g.state = w.ATTRIB;
              continue;
            case w.CLOSE_TAG:
              if (g.tagName)
                D === ">" ? Ee(g) : T(R, D) ? g.tagName += D : g.script ? (g.script += "</" + g.tagName + D, g.tagName = "", g.state = w.SCRIPT) : (b(D) || Z(g, "Invalid tagname in closing tag"), g.state = w.CLOSE_TAG_SAW_WHITE);
              else {
                if (b(D))
                  continue;
                N(_, D) ? g.script ? (g.script += "</" + D, g.state = w.SCRIPT) : Z(g, "Invalid tagname in closing tag.") : g.tagName = D;
              }
              continue;
            case w.CLOSE_TAG_SAW_WHITE:
              if (b(D))
                continue;
              D === ">" ? Ee(g) : Z(g, "Invalid characters in closing tag");
              continue;
            case w.TEXT_ENTITY:
            case w.ATTRIB_VALUE_ENTITY_Q:
            case w.ATTRIB_VALUE_ENTITY_U:
              var Pe, xe;
              switch (g.state) {
                case w.TEXT_ENTITY:
                  Pe = w.TEXT, xe = "textNode";
                  break;
                case w.ATTRIB_VALUE_ENTITY_Q:
                  Pe = w.ATTRIB_VALUE_QUOTED, xe = "attribValue";
                  break;
                case w.ATTRIB_VALUE_ENTITY_U:
                  Pe = w.ATTRIB_VALUE_UNQUOTED, xe = "attribValue";
                  break;
              }
              if (D === ";") {
                var ke = Te(g);
                g.opt.unparsedEntities && !Object.values(n.XML_ENTITIES).includes(ke) ? ((g.entityCount += 1) > g.opt.maxEntityCount && ee(
                  g,
                  "Parsed entity count exceeds max entity count"
                ), (g.entityDepth += 1) > g.opt.maxEntityDepth && ee(
                  g,
                  "Parsed entity depth exceeds max entity depth"
                ), g.entity = "", g.state = Pe, g.write(ke), g.entityDepth -= 1) : (g[xe] += ke, g.entity = "", g.state = Pe);
              } else T(g.entity.length ? I : O, D) ? g.entity += D : (Z(g, "Invalid character in entity name"), g[xe] += "&" + g.entity + D, g.entity = "", g.state = Pe);
              continue;
            default:
              throw new Error(g, "Unknown state: " + g.state);
          }
        return g.position >= g.bufferCheckPosition && d(g), g;
      }
      String.fromCodePoint || (function() {
        var y = String.fromCharCode, g = Math.floor, $ = function() {
          var D = 16384, ye = [], we, Pe, xe = -1, ke = arguments.length;
          if (!ke)
            return "";
          for (var He = ""; ++xe < ke; ) {
            var t = Number(arguments[xe]);
            if (!isFinite(t) || // `NaN`, `+Infinity`, or `-Infinity`
            t < 0 || // not a valid Unicode code point
            t > 1114111 || // not a valid Unicode code point
            g(t) !== t)
              throw RangeError("Invalid code point: " + t);
            t <= 65535 ? ye.push(t) : (t -= 65536, we = (t >> 10) + 55296, Pe = t % 1024 + 56320, ye.push(we, Pe)), (xe + 1 === ke || ye.length > D) && (He += y.apply(null, ye), ye.length = 0);
          }
          return He;
        };
        Object.defineProperty ? Object.defineProperty(String, "fromCodePoint", {
          value: $,
          configurable: !0,
          writable: !0
        }) : String.fromCodePoint = $;
      })();
    })(e);
  })(zn)), zn;
}
var Va;
function Ff() {
  if (Va) return Gt;
  Va = 1, Object.defineProperty(Gt, "__esModule", { value: !0 }), Gt.XElement = void 0, Gt.parseXml = o;
  const e = Lf(), n = rn();
  class h {
    constructor(a) {
      if (this.name = a, this.value = "", this.attributes = null, this.isCData = !1, this.elements = null, !a)
        throw (0, n.newError)("Element name cannot be empty", "ERR_XML_ELEMENT_NAME_EMPTY");
      if (!d(a))
        throw (0, n.newError)(`Invalid element name: ${a}`, "ERR_XML_ELEMENT_INVALID_NAME");
    }
    attribute(a) {
      const l = this.attributes === null ? null : this.attributes[a];
      if (l == null)
        throw (0, n.newError)(`No attribute "${a}"`, "ERR_XML_MISSED_ATTRIBUTE");
      return l;
    }
    removeAttribute(a) {
      this.attributes !== null && delete this.attributes[a];
    }
    element(a, l = !1, s = null) {
      const r = this.elementOrNull(a, l);
      if (r === null)
        throw (0, n.newError)(s || `No element "${a}"`, "ERR_XML_MISSED_ELEMENT");
      return r;
    }
    elementOrNull(a, l = !1) {
      if (this.elements === null)
        return null;
      for (const s of this.elements)
        if (f(s, a, l))
          return s;
      return null;
    }
    getElements(a, l = !1) {
      return this.elements === null ? [] : this.elements.filter((s) => f(s, a, l));
    }
    elementValueOrEmpty(a, l = !1) {
      const s = this.elementOrNull(a, l);
      return s === null ? "" : s.value;
    }
  }
  Gt.XElement = h;
  const u = new RegExp(/^[A-Za-z_][:A-Za-z0-9_-]*$/i);
  function d(c) {
    return u.test(c);
  }
  function f(c, a, l) {
    const s = c.name;
    return s === a || l === !0 && s.length === a.length && s.toLowerCase() === a.toLowerCase();
  }
  function o(c) {
    let a = null;
    const l = e.parser(!0, {}), s = [];
    return l.onopentag = (r) => {
      const i = new h(r.name);
      if (i.attributes = r.attributes, a === null)
        a = i;
      else {
        const p = s[s.length - 1];
        p.elements == null && (p.elements = []), p.elements.push(i);
      }
      s.push(i);
    }, l.onclosetag = () => {
      s.pop();
    }, l.ontext = (r) => {
      s.length > 0 && (s[s.length - 1].value = r);
    }, l.oncdata = (r) => {
      const i = s[s.length - 1];
      i.value = r, i.isCData = !0;
    }, l.onerror = (r) => {
      throw r;
    }, l.write(c), a;
  }
  return Gt;
}
var Xa;
function Be() {
  return Xa || (Xa = 1, (function(e) {
    Object.defineProperty(e, "__esModule", { value: !0 }), e.CURRENT_APP_PACKAGE_FILE_NAME = e.CURRENT_APP_INSTALLER_FILE_NAME = e.XElement = e.parseXml = e.UUID = e.parseDn = e.retry = e.githubTagPrefix = e.githubUrl = e.getS3LikeProviderBaseUrl = e.ProgressCallbackTransform = e.MemoLazy = e.safeStringifyJson = e.safeGetHeader = e.parseJson = e.HttpExecutor = e.HttpError = e.DigestTransform = e.createHttpError = e.configureRequestUrl = e.configureRequestOptionsFromUrl = e.configureRequestOptions = e.newError = e.CancellationToken = e.CancellationError = void 0, e.asArray = r;
    var n = Ao();
    Object.defineProperty(e, "CancellationError", { enumerable: !0, get: function() {
      return n.CancellationError;
    } }), Object.defineProperty(e, "CancellationToken", { enumerable: !0, get: function() {
      return n.CancellationToken;
    } });
    var h = rn();
    Object.defineProperty(e, "newError", { enumerable: !0, get: function() {
      return h.newError;
    } });
    var u = Cf();
    Object.defineProperty(e, "configureRequestOptions", { enumerable: !0, get: function() {
      return u.configureRequestOptions;
    } }), Object.defineProperty(e, "configureRequestOptionsFromUrl", { enumerable: !0, get: function() {
      return u.configureRequestOptionsFromUrl;
    } }), Object.defineProperty(e, "configureRequestUrl", { enumerable: !0, get: function() {
      return u.configureRequestUrl;
    } }), Object.defineProperty(e, "createHttpError", { enumerable: !0, get: function() {
      return u.createHttpError;
    } }), Object.defineProperty(e, "DigestTransform", { enumerable: !0, get: function() {
      return u.DigestTransform;
    } }), Object.defineProperty(e, "HttpError", { enumerable: !0, get: function() {
      return u.HttpError;
    } }), Object.defineProperty(e, "HttpExecutor", { enumerable: !0, get: function() {
      return u.HttpExecutor;
    } }), Object.defineProperty(e, "parseJson", { enumerable: !0, get: function() {
      return u.parseJson;
    } }), Object.defineProperty(e, "safeGetHeader", { enumerable: !0, get: function() {
      return u.safeGetHeader;
    } }), Object.defineProperty(e, "safeStringifyJson", { enumerable: !0, get: function() {
      return u.safeStringifyJson;
    } });
    var d = Of();
    Object.defineProperty(e, "MemoLazy", { enumerable: !0, get: function() {
      return d.MemoLazy;
    } });
    var f = mu();
    Object.defineProperty(e, "ProgressCallbackTransform", { enumerable: !0, get: function() {
      return f.ProgressCallbackTransform;
    } });
    var o = Nf();
    Object.defineProperty(e, "getS3LikeProviderBaseUrl", { enumerable: !0, get: function() {
      return o.getS3LikeProviderBaseUrl;
    } }), Object.defineProperty(e, "githubUrl", { enumerable: !0, get: function() {
      return o.githubUrl;
    } }), Object.defineProperty(e, "githubTagPrefix", { enumerable: !0, get: function() {
      return o.githubTagPrefix;
    } });
    var c = Pf();
    Object.defineProperty(e, "retry", { enumerable: !0, get: function() {
      return c.retry;
    } });
    var a = Df();
    Object.defineProperty(e, "parseDn", { enumerable: !0, get: function() {
      return a.parseDn;
    } });
    var l = If();
    Object.defineProperty(e, "UUID", { enumerable: !0, get: function() {
      return l.UUID;
    } });
    var s = Ff();
    Object.defineProperty(e, "parseXml", { enumerable: !0, get: function() {
      return s.parseXml;
    } }), Object.defineProperty(e, "XElement", { enumerable: !0, get: function() {
      return s.XElement;
    } }), e.CURRENT_APP_INSTALLER_FILE_NAME = "installer.exe", e.CURRENT_APP_PACKAGE_FILE_NAME = "package.7z";
    function r(i) {
      return i == null ? [] : Array.isArray(i) ? i : [i];
    }
  })(Gn)), Gn;
}
var Ve = {}, Xr = {}, Et = {}, Ya;
function Nr() {
  if (Ya) return Et;
  Ya = 1;
  function e(o) {
    return typeof o > "u" || o === null;
  }
  function n(o) {
    return typeof o == "object" && o !== null;
  }
  function h(o) {
    return Array.isArray(o) ? o : e(o) ? [] : [o];
  }
  function u(o, c) {
    var a, l, s, r;
    if (c)
      for (r = Object.keys(c), a = 0, l = r.length; a < l; a += 1)
        s = r[a], o[s] = c[s];
    return o;
  }
  function d(o, c) {
    var a = "", l;
    for (l = 0; l < c; l += 1)
      a += o;
    return a;
  }
  function f(o) {
    return o === 0 && Number.NEGATIVE_INFINITY === 1 / o;
  }
  return Et.isNothing = e, Et.isObject = n, Et.toArray = h, Et.repeat = d, Et.isNegativeZero = f, Et.extend = u, Et;
}
var Kn, za;
function Pr() {
  if (za) return Kn;
  za = 1;
  function e(h, u) {
    var d = "", f = h.reason || "(unknown reason)";
    return h.mark ? (h.mark.name && (d += 'in "' + h.mark.name + '" '), d += "(" + (h.mark.line + 1) + ":" + (h.mark.column + 1) + ")", !u && h.mark.snippet && (d += `

` + h.mark.snippet), f + " " + d) : f;
  }
  function n(h, u) {
    Error.call(this), this.name = "YAMLException", this.reason = h, this.mark = u, this.message = e(this, !1), Error.captureStackTrace ? Error.captureStackTrace(this, this.constructor) : this.stack = new Error().stack || "";
  }
  return n.prototype = Object.create(Error.prototype), n.prototype.constructor = n, n.prototype.toString = function(u) {
    return this.name + ": " + e(this, u);
  }, Kn = n, Kn;
}
var Jn, Ka;
function Uf() {
  if (Ka) return Jn;
  Ka = 1;
  var e = Nr();
  function n(d, f, o, c, a) {
    var l = "", s = "", r = Math.floor(a / 2) - 1;
    return c - f > r && (l = " ... ", f = c - r + l.length), o - c > r && (s = " ...", o = c + r - s.length), {
      str: l + d.slice(f, o).replace(/\t/g, "→") + s,
      pos: c - f + l.length
      // relative position
    };
  }
  function h(d, f) {
    return e.repeat(" ", f - d.length) + d;
  }
  function u(d, f) {
    if (f = Object.create(f || null), !d.buffer) return null;
    f.maxLength || (f.maxLength = 79), typeof f.indent != "number" && (f.indent = 1), typeof f.linesBefore != "number" && (f.linesBefore = 3), typeof f.linesAfter != "number" && (f.linesAfter = 2);
    for (var o = /\r?\n|\r|\0/g, c = [0], a = [], l, s = -1; l = o.exec(d.buffer); )
      a.push(l.index), c.push(l.index + l[0].length), d.position <= l.index && s < 0 && (s = c.length - 2);
    s < 0 && (s = c.length - 1);
    var r = "", i, p, E = Math.min(d.line + f.linesAfter, a.length).toString().length, v = f.maxLength - (f.indent + E + 3);
    for (i = 1; i <= f.linesBefore && !(s - i < 0); i++)
      p = n(
        d.buffer,
        c[s - i],
        a[s - i],
        d.position - (c[s] - c[s - i]),
        v
      ), r = e.repeat(" ", f.indent) + h((d.line - i + 1).toString(), E) + " | " + p.str + `
` + r;
    for (p = n(d.buffer, c[s], a[s], d.position, v), r += e.repeat(" ", f.indent) + h((d.line + 1).toString(), E) + " | " + p.str + `
`, r += e.repeat("-", f.indent + E + 3 + p.pos) + `^
`, i = 1; i <= f.linesAfter && !(s + i >= a.length); i++)
      p = n(
        d.buffer,
        c[s + i],
        a[s + i],
        d.position - (c[s] - c[s + i]),
        v
      ), r += e.repeat(" ", f.indent) + h((d.line + i + 1).toString(), E) + " | " + p.str + `
`;
    return r.replace(/\n$/, "");
  }
  return Jn = u, Jn;
}
var Qn, Ja;
function Xe() {
  if (Ja) return Qn;
  Ja = 1;
  var e = Pr(), n = [
    "kind",
    "multi",
    "resolve",
    "construct",
    "instanceOf",
    "predicate",
    "represent",
    "representName",
    "defaultStyle",
    "styleAliases"
  ], h = [
    "scalar",
    "sequence",
    "mapping"
  ];
  function u(f) {
    var o = {};
    return f !== null && Object.keys(f).forEach(function(c) {
      f[c].forEach(function(a) {
        o[String(a)] = c;
      });
    }), o;
  }
  function d(f, o) {
    if (o = o || {}, Object.keys(o).forEach(function(c) {
      if (n.indexOf(c) === -1)
        throw new e('Unknown option "' + c + '" is met in definition of "' + f + '" YAML type.');
    }), this.options = o, this.tag = f, this.kind = o.kind || null, this.resolve = o.resolve || function() {
      return !0;
    }, this.construct = o.construct || function(c) {
      return c;
    }, this.instanceOf = o.instanceOf || null, this.predicate = o.predicate || null, this.represent = o.represent || null, this.representName = o.representName || null, this.defaultStyle = o.defaultStyle || null, this.multi = o.multi || !1, this.styleAliases = u(o.styleAliases || null), h.indexOf(this.kind) === -1)
      throw new e('Unknown kind "' + this.kind + '" is specified for "' + f + '" YAML type.');
  }
  return Qn = d, Qn;
}
var Zn, Qa;
function gu() {
  if (Qa) return Zn;
  Qa = 1;
  var e = Pr(), n = Xe();
  function h(f, o) {
    var c = [];
    return f[o].forEach(function(a) {
      var l = c.length;
      c.forEach(function(s, r) {
        s.tag === a.tag && s.kind === a.kind && s.multi === a.multi && (l = r);
      }), c[l] = a;
    }), c;
  }
  function u() {
    var f = {
      scalar: {},
      sequence: {},
      mapping: {},
      fallback: {},
      multi: {
        scalar: [],
        sequence: [],
        mapping: [],
        fallback: []
      }
    }, o, c;
    function a(l) {
      l.multi ? (f.multi[l.kind].push(l), f.multi.fallback.push(l)) : f[l.kind][l.tag] = f.fallback[l.tag] = l;
    }
    for (o = 0, c = arguments.length; o < c; o += 1)
      arguments[o].forEach(a);
    return f;
  }
  function d(f) {
    return this.extend(f);
  }
  return d.prototype.extend = function(o) {
    var c = [], a = [];
    if (o instanceof n)
      a.push(o);
    else if (Array.isArray(o))
      a = a.concat(o);
    else if (o && (Array.isArray(o.implicit) || Array.isArray(o.explicit)))
      o.implicit && (c = c.concat(o.implicit)), o.explicit && (a = a.concat(o.explicit));
    else
      throw new e("Schema.extend argument should be a Type, [ Type ], or a schema definition ({ implicit: [...], explicit: [...] })");
    c.forEach(function(s) {
      if (!(s instanceof n))
        throw new e("Specified list of YAML types (or a single Type object) contains a non-Type object.");
      if (s.loadKind && s.loadKind !== "scalar")
        throw new e("There is a non-scalar type in the implicit list of a schema. Implicit resolving of such types is not supported.");
      if (s.multi)
        throw new e("There is a multi type in the implicit list of a schema. Multi tags can only be listed as explicit.");
    }), a.forEach(function(s) {
      if (!(s instanceof n))
        throw new e("Specified list of YAML types (or a single Type object) contains a non-Type object.");
    });
    var l = Object.create(d.prototype);
    return l.implicit = (this.implicit || []).concat(c), l.explicit = (this.explicit || []).concat(a), l.compiledImplicit = h(l, "implicit"), l.compiledExplicit = h(l, "explicit"), l.compiledTypeMap = u(l.compiledImplicit, l.compiledExplicit), l;
  }, Zn = d, Zn;
}
var ei, Za;
function Eu() {
  if (Za) return ei;
  Za = 1;
  var e = Xe();
  return ei = new e("tag:yaml.org,2002:str", {
    kind: "scalar",
    construct: function(n) {
      return n !== null ? n : "";
    }
  }), ei;
}
var ti, es;
function vu() {
  if (es) return ti;
  es = 1;
  var e = Xe();
  return ti = new e("tag:yaml.org,2002:seq", {
    kind: "sequence",
    construct: function(n) {
      return n !== null ? n : [];
    }
  }), ti;
}
var ri, ts;
function yu() {
  if (ts) return ri;
  ts = 1;
  var e = Xe();
  return ri = new e("tag:yaml.org,2002:map", {
    kind: "mapping",
    construct: function(n) {
      return n !== null ? n : {};
    }
  }), ri;
}
var ni, rs;
function wu() {
  if (rs) return ni;
  rs = 1;
  var e = gu();
  return ni = new e({
    explicit: [
      Eu(),
      vu(),
      yu()
    ]
  }), ni;
}
var ii, ns;
function _u() {
  if (ns) return ii;
  ns = 1;
  var e = Xe();
  function n(d) {
    if (d === null) return !0;
    var f = d.length;
    return f === 1 && d === "~" || f === 4 && (d === "null" || d === "Null" || d === "NULL");
  }
  function h() {
    return null;
  }
  function u(d) {
    return d === null;
  }
  return ii = new e("tag:yaml.org,2002:null", {
    kind: "scalar",
    resolve: n,
    construct: h,
    predicate: u,
    represent: {
      canonical: function() {
        return "~";
      },
      lowercase: function() {
        return "null";
      },
      uppercase: function() {
        return "NULL";
      },
      camelcase: function() {
        return "Null";
      },
      empty: function() {
        return "";
      }
    },
    defaultStyle: "lowercase"
  }), ii;
}
var oi, is;
function Tu() {
  if (is) return oi;
  is = 1;
  var e = Xe();
  function n(d) {
    if (d === null) return !1;
    var f = d.length;
    return f === 4 && (d === "true" || d === "True" || d === "TRUE") || f === 5 && (d === "false" || d === "False" || d === "FALSE");
  }
  function h(d) {
    return d === "true" || d === "True" || d === "TRUE";
  }
  function u(d) {
    return Object.prototype.toString.call(d) === "[object Boolean]";
  }
  return oi = new e("tag:yaml.org,2002:bool", {
    kind: "scalar",
    resolve: n,
    construct: h,
    predicate: u,
    represent: {
      lowercase: function(d) {
        return d ? "true" : "false";
      },
      uppercase: function(d) {
        return d ? "TRUE" : "FALSE";
      },
      camelcase: function(d) {
        return d ? "True" : "False";
      }
    },
    defaultStyle: "lowercase"
  }), oi;
}
var ai, os;
function Au() {
  if (os) return ai;
  os = 1;
  var e = Nr(), n = Xe();
  function h(a) {
    return 48 <= a && a <= 57 || 65 <= a && a <= 70 || 97 <= a && a <= 102;
  }
  function u(a) {
    return 48 <= a && a <= 55;
  }
  function d(a) {
    return 48 <= a && a <= 57;
  }
  function f(a) {
    if (a === null) return !1;
    var l = a.length, s = 0, r = !1, i;
    if (!l) return !1;
    if (i = a[s], (i === "-" || i === "+") && (i = a[++s]), i === "0") {
      if (s + 1 === l) return !0;
      if (i = a[++s], i === "b") {
        for (s++; s < l; s++)
          if (i = a[s], i !== "_") {
            if (i !== "0" && i !== "1") return !1;
            r = !0;
          }
        return r && i !== "_";
      }
      if (i === "x") {
        for (s++; s < l; s++)
          if (i = a[s], i !== "_") {
            if (!h(a.charCodeAt(s))) return !1;
            r = !0;
          }
        return r && i !== "_";
      }
      if (i === "o") {
        for (s++; s < l; s++)
          if (i = a[s], i !== "_") {
            if (!u(a.charCodeAt(s))) return !1;
            r = !0;
          }
        return r && i !== "_";
      }
    }
    if (i === "_") return !1;
    for (; s < l; s++)
      if (i = a[s], i !== "_") {
        if (!d(a.charCodeAt(s)))
          return !1;
        r = !0;
      }
    return !(!r || i === "_");
  }
  function o(a) {
    var l = a, s = 1, r;
    if (l.indexOf("_") !== -1 && (l = l.replace(/_/g, "")), r = l[0], (r === "-" || r === "+") && (r === "-" && (s = -1), l = l.slice(1), r = l[0]), l === "0") return 0;
    if (r === "0") {
      if (l[1] === "b") return s * parseInt(l.slice(2), 2);
      if (l[1] === "x") return s * parseInt(l.slice(2), 16);
      if (l[1] === "o") return s * parseInt(l.slice(2), 8);
    }
    return s * parseInt(l, 10);
  }
  function c(a) {
    return Object.prototype.toString.call(a) === "[object Number]" && a % 1 === 0 && !e.isNegativeZero(a);
  }
  return ai = new n("tag:yaml.org,2002:int", {
    kind: "scalar",
    resolve: f,
    construct: o,
    predicate: c,
    represent: {
      binary: function(a) {
        return a >= 0 ? "0b" + a.toString(2) : "-0b" + a.toString(2).slice(1);
      },
      octal: function(a) {
        return a >= 0 ? "0o" + a.toString(8) : "-0o" + a.toString(8).slice(1);
      },
      decimal: function(a) {
        return a.toString(10);
      },
      /* eslint-disable max-len */
      hexadecimal: function(a) {
        return a >= 0 ? "0x" + a.toString(16).toUpperCase() : "-0x" + a.toString(16).toUpperCase().slice(1);
      }
    },
    defaultStyle: "decimal",
    styleAliases: {
      binary: [2, "bin"],
      octal: [8, "oct"],
      decimal: [10, "dec"],
      hexadecimal: [16, "hex"]
    }
  }), ai;
}
var si, as;
function Ru() {
  if (as) return si;
  as = 1;
  var e = Nr(), n = Xe(), h = new RegExp(
    // 2.5e4, 2.5 and integers
    "^(?:[-+]?(?:[0-9][0-9_]*)(?:\\.[0-9_]*)?(?:[eE][-+]?[0-9]+)?|\\.[0-9_]+(?:[eE][-+]?[0-9]+)?|[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$"
  );
  function u(a) {
    return !(a === null || !h.test(a) || // Quick hack to not allow integers end with `_`
    // Probably should update regexp & check speed
    a[a.length - 1] === "_");
  }
  function d(a) {
    var l, s;
    return l = a.replace(/_/g, "").toLowerCase(), s = l[0] === "-" ? -1 : 1, "+-".indexOf(l[0]) >= 0 && (l = l.slice(1)), l === ".inf" ? s === 1 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY : l === ".nan" ? NaN : s * parseFloat(l, 10);
  }
  var f = /^[-+]?[0-9]+e/;
  function o(a, l) {
    var s;
    if (isNaN(a))
      switch (l) {
        case "lowercase":
          return ".nan";
        case "uppercase":
          return ".NAN";
        case "camelcase":
          return ".NaN";
      }
    else if (Number.POSITIVE_INFINITY === a)
      switch (l) {
        case "lowercase":
          return ".inf";
        case "uppercase":
          return ".INF";
        case "camelcase":
          return ".Inf";
      }
    else if (Number.NEGATIVE_INFINITY === a)
      switch (l) {
        case "lowercase":
          return "-.inf";
        case "uppercase":
          return "-.INF";
        case "camelcase":
          return "-.Inf";
      }
    else if (e.isNegativeZero(a))
      return "-0.0";
    return s = a.toString(10), f.test(s) ? s.replace("e", ".e") : s;
  }
  function c(a) {
    return Object.prototype.toString.call(a) === "[object Number]" && (a % 1 !== 0 || e.isNegativeZero(a));
  }
  return si = new n("tag:yaml.org,2002:float", {
    kind: "scalar",
    resolve: u,
    construct: d,
    predicate: c,
    represent: o,
    defaultStyle: "lowercase"
  }), si;
}
var li, ss;
function bu() {
  return ss || (ss = 1, li = wu().extend({
    implicit: [
      _u(),
      Tu(),
      Au(),
      Ru()
    ]
  })), li;
}
var ui, ls;
function Su() {
  return ls || (ls = 1, ui = bu()), ui;
}
var ci, us;
function Cu() {
  if (us) return ci;
  us = 1;
  var e = Xe(), n = new RegExp(
    "^([0-9][0-9][0-9][0-9])-([0-9][0-9])-([0-9][0-9])$"
  ), h = new RegExp(
    "^([0-9][0-9][0-9][0-9])-([0-9][0-9]?)-([0-9][0-9]?)(?:[Tt]|[ \\t]+)([0-9][0-9]?):([0-9][0-9]):([0-9][0-9])(?:\\.([0-9]*))?(?:[ \\t]*(Z|([-+])([0-9][0-9]?)(?::([0-9][0-9]))?))?$"
  );
  function u(o) {
    return o === null ? !1 : n.exec(o) !== null || h.exec(o) !== null;
  }
  function d(o) {
    var c, a, l, s, r, i, p, E = 0, v = null, m, _, R;
    if (c = n.exec(o), c === null && (c = h.exec(o)), c === null) throw new Error("Date resolve error");
    if (a = +c[1], l = +c[2] - 1, s = +c[3], !c[4])
      return new Date(Date.UTC(a, l, s));
    if (r = +c[4], i = +c[5], p = +c[6], c[7]) {
      for (E = c[7].slice(0, 3); E.length < 3; )
        E += "0";
      E = +E;
    }
    return c[9] && (m = +c[10], _ = +(c[11] || 0), v = (m * 60 + _) * 6e4, c[9] === "-" && (v = -v)), R = new Date(Date.UTC(a, l, s, r, i, p, E)), v && R.setTime(R.getTime() - v), R;
  }
  function f(o) {
    return o.toISOString();
  }
  return ci = new e("tag:yaml.org,2002:timestamp", {
    kind: "scalar",
    resolve: u,
    construct: d,
    instanceOf: Date,
    represent: f
  }), ci;
}
var fi, cs;
function Ou() {
  if (cs) return fi;
  cs = 1;
  var e = Xe();
  function n(h) {
    return h === "<<" || h === null;
  }
  return fi = new e("tag:yaml.org,2002:merge", {
    kind: "scalar",
    resolve: n
  }), fi;
}
var di, fs;
function Nu() {
  if (fs) return di;
  fs = 1;
  var e = Xe(), n = `ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=
\r`;
  function h(o) {
    if (o === null) return !1;
    var c, a, l = 0, s = o.length, r = n;
    for (a = 0; a < s; a++)
      if (c = r.indexOf(o.charAt(a)), !(c > 64)) {
        if (c < 0) return !1;
        l += 6;
      }
    return l % 8 === 0;
  }
  function u(o) {
    var c, a, l = o.replace(/[\r\n=]/g, ""), s = l.length, r = n, i = 0, p = [];
    for (c = 0; c < s; c++)
      c % 4 === 0 && c && (p.push(i >> 16 & 255), p.push(i >> 8 & 255), p.push(i & 255)), i = i << 6 | r.indexOf(l.charAt(c));
    return a = s % 4 * 6, a === 0 ? (p.push(i >> 16 & 255), p.push(i >> 8 & 255), p.push(i & 255)) : a === 18 ? (p.push(i >> 10 & 255), p.push(i >> 2 & 255)) : a === 12 && p.push(i >> 4 & 255), new Uint8Array(p);
  }
  function d(o) {
    var c = "", a = 0, l, s, r = o.length, i = n;
    for (l = 0; l < r; l++)
      l % 3 === 0 && l && (c += i[a >> 18 & 63], c += i[a >> 12 & 63], c += i[a >> 6 & 63], c += i[a & 63]), a = (a << 8) + o[l];
    return s = r % 3, s === 0 ? (c += i[a >> 18 & 63], c += i[a >> 12 & 63], c += i[a >> 6 & 63], c += i[a & 63]) : s === 2 ? (c += i[a >> 10 & 63], c += i[a >> 4 & 63], c += i[a << 2 & 63], c += i[64]) : s === 1 && (c += i[a >> 2 & 63], c += i[a << 4 & 63], c += i[64], c += i[64]), c;
  }
  function f(o) {
    return Object.prototype.toString.call(o) === "[object Uint8Array]";
  }
  return di = new e("tag:yaml.org,2002:binary", {
    kind: "scalar",
    resolve: h,
    construct: u,
    predicate: f,
    represent: d
  }), di;
}
var hi, ds;
function Pu() {
  if (ds) return hi;
  ds = 1;
  var e = Xe(), n = Object.prototype.hasOwnProperty, h = Object.prototype.toString;
  function u(f) {
    if (f === null) return !0;
    var o = [], c, a, l, s, r, i = f;
    for (c = 0, a = i.length; c < a; c += 1) {
      if (l = i[c], r = !1, h.call(l) !== "[object Object]") return !1;
      for (s in l)
        if (n.call(l, s))
          if (!r) r = !0;
          else return !1;
      if (!r) return !1;
      if (o.indexOf(s) === -1) o.push(s);
      else return !1;
    }
    return !0;
  }
  function d(f) {
    return f !== null ? f : [];
  }
  return hi = new e("tag:yaml.org,2002:omap", {
    kind: "sequence",
    resolve: u,
    construct: d
  }), hi;
}
var pi, hs;
function Du() {
  if (hs) return pi;
  hs = 1;
  var e = Xe(), n = Object.prototype.toString;
  function h(d) {
    if (d === null) return !0;
    var f, o, c, a, l, s = d;
    for (l = new Array(s.length), f = 0, o = s.length; f < o; f += 1) {
      if (c = s[f], n.call(c) !== "[object Object]" || (a = Object.keys(c), a.length !== 1)) return !1;
      l[f] = [a[0], c[a[0]]];
    }
    return !0;
  }
  function u(d) {
    if (d === null) return [];
    var f, o, c, a, l, s = d;
    for (l = new Array(s.length), f = 0, o = s.length; f < o; f += 1)
      c = s[f], a = Object.keys(c), l[f] = [a[0], c[a[0]]];
    return l;
  }
  return pi = new e("tag:yaml.org,2002:pairs", {
    kind: "sequence",
    resolve: h,
    construct: u
  }), pi;
}
var mi, ps;
function Iu() {
  if (ps) return mi;
  ps = 1;
  var e = Xe(), n = Object.prototype.hasOwnProperty;
  function h(d) {
    if (d === null) return !0;
    var f, o = d;
    for (f in o)
      if (n.call(o, f) && o[f] !== null)
        return !1;
    return !0;
  }
  function u(d) {
    return d !== null ? d : {};
  }
  return mi = new e("tag:yaml.org,2002:set", {
    kind: "mapping",
    resolve: h,
    construct: u
  }), mi;
}
var gi, ms;
function Ro() {
  return ms || (ms = 1, gi = Su().extend({
    implicit: [
      Cu(),
      Ou()
    ],
    explicit: [
      Nu(),
      Pu(),
      Du(),
      Iu()
    ]
  })), gi;
}
var gs;
function xf() {
  if (gs) return Xr;
  gs = 1;
  var e = Nr(), n = Pr(), h = Uf(), u = Ro(), d = Object.prototype.hasOwnProperty, f = 1, o = 2, c = 3, a = 4, l = 1, s = 2, r = 3, i = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/, p = /[\x85\u2028\u2029]/, E = /[,\[\]\{\}]/, v = /^(?:!|!!|![a-z\-]+!)$/i, m = /^(?:!|[^,\[\]\{\}])(?:%[0-9a-f]{2}|[0-9a-z\-#;\/\?:@&=\+\$,_\.!~\*'\(\)\[\]])*$/i;
  function _(t) {
    return Object.prototype.toString.call(t);
  }
  function R(t) {
    return t === 10 || t === 13;
  }
  function O(t) {
    return t === 9 || t === 32;
  }
  function I(t) {
    return t === 9 || t === 32 || t === 10 || t === 13;
  }
  function b(t) {
    return t === 44 || t === 91 || t === 93 || t === 123 || t === 125;
  }
  function P(t) {
    var B;
    return 48 <= t && t <= 57 ? t - 48 : (B = t | 32, 97 <= B && B <= 102 ? B - 97 + 10 : -1);
  }
  function C(t) {
    return t === 120 ? 2 : t === 117 ? 4 : t === 85 ? 8 : 0;
  }
  function T(t) {
    return 48 <= t && t <= 57 ? t - 48 : -1;
  }
  function N(t) {
    return t === 48 ? "\0" : t === 97 ? "\x07" : t === 98 ? "\b" : t === 116 || t === 9 ? "	" : t === 110 ? `
` : t === 118 ? "\v" : t === 102 ? "\f" : t === 114 ? "\r" : t === 101 ? "\x1B" : t === 32 ? " " : t === 34 ? '"' : t === 47 ? "/" : t === 92 ? "\\" : t === 78 ? "" : t === 95 ? " " : t === 76 ? "\u2028" : t === 80 ? "\u2029" : "";
  }
  function w(t) {
    return t <= 65535 ? String.fromCharCode(t) : String.fromCharCode(
      (t - 65536 >> 10) + 55296,
      (t - 65536 & 1023) + 56320
    );
  }
  function q(t, B, W) {
    B === "__proto__" ? Object.defineProperty(t, B, {
      configurable: !0,
      enumerable: !0,
      writable: !0,
      value: W
    }) : t[B] = W;
  }
  for (var k = new Array(256), M = new Array(256), U = 0; U < 256; U++)
    k[U] = N(U) ? 1 : 0, M[U] = N(U);
  function F(t, B) {
    this.input = t, this.filename = B.filename || null, this.schema = B.schema || u, this.onWarning = B.onWarning || null, this.legacy = B.legacy || !1, this.json = B.json || !1, this.listener = B.listener || null, this.implicitTypes = this.schema.compiledImplicit, this.typeMap = this.schema.compiledTypeMap, this.length = t.length, this.position = 0, this.line = 0, this.lineStart = 0, this.lineIndent = 0, this.firstTabInLine = -1, this.documents = [];
  }
  function H(t, B) {
    var W = {
      name: t.filename,
      buffer: t.input.slice(0, -1),
      // omit trailing \0
      position: t.position,
      line: t.line,
      column: t.position - t.lineStart
    };
    return W.snippet = h(W), new n(B, W);
  }
  function L(t, B) {
    throw H(t, B);
  }
  function G(t, B) {
    t.onWarning && t.onWarning.call(null, H(t, B));
  }
  var X = {
    YAML: function(B, W, ie) {
      var V, ne, te;
      B.version !== null && L(B, "duplication of %YAML directive"), ie.length !== 1 && L(B, "YAML directive accepts exactly one argument"), V = /^([0-9]+)\.([0-9]+)$/.exec(ie[0]), V === null && L(B, "ill-formed argument of the YAML directive"), ne = parseInt(V[1], 10), te = parseInt(V[2], 10), ne !== 1 && L(B, "unacceptable YAML version of the document"), B.version = ie[0], B.checkLineBreaks = te < 2, te !== 1 && te !== 2 && G(B, "unsupported YAML version of the document");
    },
    TAG: function(B, W, ie) {
      var V, ne;
      ie.length !== 2 && L(B, "TAG directive accepts exactly two arguments"), V = ie[0], ne = ie[1], v.test(V) || L(B, "ill-formed tag handle (first argument) of the TAG directive"), d.call(B.tagMap, V) && L(B, 'there is a previously declared suffix for "' + V + '" tag handle'), m.test(ne) || L(B, "ill-formed tag prefix (second argument) of the TAG directive");
      try {
        ne = decodeURIComponent(ne);
      } catch {
        L(B, "tag prefix is malformed: " + ne);
      }
      B.tagMap[V] = ne;
    }
  };
  function ee(t, B, W, ie) {
    var V, ne, te, ae;
    if (B < W) {
      if (ae = t.input.slice(B, W), ie)
        for (V = 0, ne = ae.length; V < ne; V += 1)
          te = ae.charCodeAt(V), te === 9 || 32 <= te && te <= 1114111 || L(t, "expected valid JSON character");
      else i.test(ae) && L(t, "the stream contains non-printable characters");
      t.result += ae;
    }
  }
  function he(t, B, W, ie) {
    var V, ne, te, ae;
    for (e.isObject(W) || L(t, "cannot merge mappings; the provided source object is unacceptable"), V = Object.keys(W), te = 0, ae = V.length; te < ae; te += 1)
      ne = V[te], d.call(B, ne) || (q(B, ne, W[ne]), ie[ne] = !0);
  }
  function Z(t, B, W, ie, V, ne, te, ae, ue) {
    var Ae, Re;
    if (Array.isArray(V))
      for (V = Array.prototype.slice.call(V), Ae = 0, Re = V.length; Ae < Re; Ae += 1)
        Array.isArray(V[Ae]) && L(t, "nested arrays are not supported inside keys"), typeof V == "object" && _(V[Ae]) === "[object Object]" && (V[Ae] = "[object Object]");
    if (typeof V == "object" && _(V) === "[object Object]" && (V = "[object Object]"), V = String(V), B === null && (B = {}), ie === "tag:yaml.org,2002:merge")
      if (Array.isArray(ne))
        for (Ae = 0, Re = ne.length; Ae < Re; Ae += 1)
          he(t, B, ne[Ae], W);
      else
        he(t, B, ne, W);
    else
      !t.json && !d.call(W, V) && d.call(B, V) && (t.line = te || t.line, t.lineStart = ae || t.lineStart, t.position = ue || t.position, L(t, "duplicated mapping key")), q(B, V, ne), delete W[V];
    return B;
  }
  function ge(t) {
    var B;
    B = t.input.charCodeAt(t.position), B === 10 ? t.position++ : B === 13 ? (t.position++, t.input.charCodeAt(t.position) === 10 && t.position++) : L(t, "a line break is expected"), t.line += 1, t.lineStart = t.position, t.firstTabInLine = -1;
  }
  function pe(t, B, W) {
    for (var ie = 0, V = t.input.charCodeAt(t.position); V !== 0; ) {
      for (; O(V); )
        V === 9 && t.firstTabInLine === -1 && (t.firstTabInLine = t.position), V = t.input.charCodeAt(++t.position);
      if (B && V === 35)
        do
          V = t.input.charCodeAt(++t.position);
        while (V !== 10 && V !== 13 && V !== 0);
      if (R(V))
        for (ge(t), V = t.input.charCodeAt(t.position), ie++, t.lineIndent = 0; V === 32; )
          t.lineIndent++, V = t.input.charCodeAt(++t.position);
      else
        break;
    }
    return W !== -1 && ie !== 0 && t.lineIndent < W && G(t, "deficient indentation"), ie;
  }
  function Q(t) {
    var B = t.position, W;
    return W = t.input.charCodeAt(B), !!((W === 45 || W === 46) && W === t.input.charCodeAt(B + 1) && W === t.input.charCodeAt(B + 2) && (B += 3, W = t.input.charCodeAt(B), W === 0 || I(W)));
  }
  function ce(t, B) {
    B === 1 ? t.result += " " : B > 1 && (t.result += e.repeat(`
`, B - 1));
  }
  function Ee(t, B, W) {
    var ie, V, ne, te, ae, ue, Ae, Re, de = t.kind, A = t.result, j;
    if (j = t.input.charCodeAt(t.position), I(j) || b(j) || j === 35 || j === 38 || j === 42 || j === 33 || j === 124 || j === 62 || j === 39 || j === 34 || j === 37 || j === 64 || j === 96 || (j === 63 || j === 45) && (V = t.input.charCodeAt(t.position + 1), I(V) || W && b(V)))
      return !1;
    for (t.kind = "scalar", t.result = "", ne = te = t.position, ae = !1; j !== 0; ) {
      if (j === 58) {
        if (V = t.input.charCodeAt(t.position + 1), I(V) || W && b(V))
          break;
      } else if (j === 35) {
        if (ie = t.input.charCodeAt(t.position - 1), I(ie))
          break;
      } else {
        if (t.position === t.lineStart && Q(t) || W && b(j))
          break;
        if (R(j))
          if (ue = t.line, Ae = t.lineStart, Re = t.lineIndent, pe(t, !1, -1), t.lineIndent >= B) {
            ae = !0, j = t.input.charCodeAt(t.position);
            continue;
          } else {
            t.position = te, t.line = ue, t.lineStart = Ae, t.lineIndent = Re;
            break;
          }
      }
      ae && (ee(t, ne, te, !1), ce(t, t.line - ue), ne = te = t.position, ae = !1), O(j) || (te = t.position + 1), j = t.input.charCodeAt(++t.position);
    }
    return ee(t, ne, te, !1), t.result ? !0 : (t.kind = de, t.result = A, !1);
  }
  function Te(t, B) {
    var W, ie, V;
    if (W = t.input.charCodeAt(t.position), W !== 39)
      return !1;
    for (t.kind = "scalar", t.result = "", t.position++, ie = V = t.position; (W = t.input.charCodeAt(t.position)) !== 0; )
      if (W === 39)
        if (ee(t, ie, t.position, !0), W = t.input.charCodeAt(++t.position), W === 39)
          ie = t.position, t.position++, V = t.position;
        else
          return !0;
      else R(W) ? (ee(t, ie, V, !0), ce(t, pe(t, !1, B)), ie = V = t.position) : t.position === t.lineStart && Q(t) ? L(t, "unexpected end of the document within a single quoted scalar") : (t.position++, V = t.position);
    L(t, "unexpected end of the stream within a single quoted scalar");
  }
  function Oe(t, B) {
    var W, ie, V, ne, te, ae;
    if (ae = t.input.charCodeAt(t.position), ae !== 34)
      return !1;
    for (t.kind = "scalar", t.result = "", t.position++, W = ie = t.position; (ae = t.input.charCodeAt(t.position)) !== 0; ) {
      if (ae === 34)
        return ee(t, W, t.position, !0), t.position++, !0;
      if (ae === 92) {
        if (ee(t, W, t.position, !0), ae = t.input.charCodeAt(++t.position), R(ae))
          pe(t, !1, B);
        else if (ae < 256 && k[ae])
          t.result += M[ae], t.position++;
        else if ((te = C(ae)) > 0) {
          for (V = te, ne = 0; V > 0; V--)
            ae = t.input.charCodeAt(++t.position), (te = P(ae)) >= 0 ? ne = (ne << 4) + te : L(t, "expected hexadecimal character");
          t.result += w(ne), t.position++;
        } else
          L(t, "unknown escape sequence");
        W = ie = t.position;
      } else R(ae) ? (ee(t, W, ie, !0), ce(t, pe(t, !1, B)), W = ie = t.position) : t.position === t.lineStart && Q(t) ? L(t, "unexpected end of the document within a double quoted scalar") : (t.position++, ie = t.position);
    }
    L(t, "unexpected end of the stream within a double quoted scalar");
  }
  function Ce(t, B) {
    var W = !0, ie, V, ne, te = t.tag, ae, ue = t.anchor, Ae, Re, de, A, j, Y = /* @__PURE__ */ Object.create(null), z, K, oe, re;
    if (re = t.input.charCodeAt(t.position), re === 91)
      Re = 93, j = !1, ae = [];
    else if (re === 123)
      Re = 125, j = !0, ae = {};
    else
      return !1;
    for (t.anchor !== null && (t.anchorMap[t.anchor] = ae), re = t.input.charCodeAt(++t.position); re !== 0; ) {
      if (pe(t, !0, B), re = t.input.charCodeAt(t.position), re === Re)
        return t.position++, t.tag = te, t.anchor = ue, t.kind = j ? "mapping" : "sequence", t.result = ae, !0;
      W ? re === 44 && L(t, "expected the node content, but found ','") : L(t, "missed comma between flow collection entries"), K = z = oe = null, de = A = !1, re === 63 && (Ae = t.input.charCodeAt(t.position + 1), I(Ae) && (de = A = !0, t.position++, pe(t, !0, B))), ie = t.line, V = t.lineStart, ne = t.position, we(t, B, f, !1, !0), K = t.tag, z = t.result, pe(t, !0, B), re = t.input.charCodeAt(t.position), (A || t.line === ie) && re === 58 && (de = !0, re = t.input.charCodeAt(++t.position), pe(t, !0, B), we(t, B, f, !1, !0), oe = t.result), j ? Z(t, ae, Y, K, z, oe, ie, V, ne) : de ? ae.push(Z(t, null, Y, K, z, oe, ie, V, ne)) : ae.push(z), pe(t, !0, B), re = t.input.charCodeAt(t.position), re === 44 ? (W = !0, re = t.input.charCodeAt(++t.position)) : W = !1;
    }
    L(t, "unexpected end of the stream within a flow collection");
  }
  function _e(t, B) {
    var W, ie, V = l, ne = !1, te = !1, ae = B, ue = 0, Ae = !1, Re, de;
    if (de = t.input.charCodeAt(t.position), de === 124)
      ie = !1;
    else if (de === 62)
      ie = !0;
    else
      return !1;
    for (t.kind = "scalar", t.result = ""; de !== 0; )
      if (de = t.input.charCodeAt(++t.position), de === 43 || de === 45)
        l === V ? V = de === 43 ? r : s : L(t, "repeat of a chomping mode identifier");
      else if ((Re = T(de)) >= 0)
        Re === 0 ? L(t, "bad explicit indentation width of a block scalar; it cannot be less than one") : te ? L(t, "repeat of an indentation width identifier") : (ae = B + Re - 1, te = !0);
      else
        break;
    if (O(de)) {
      do
        de = t.input.charCodeAt(++t.position);
      while (O(de));
      if (de === 35)
        do
          de = t.input.charCodeAt(++t.position);
        while (!R(de) && de !== 0);
    }
    for (; de !== 0; ) {
      for (ge(t), t.lineIndent = 0, de = t.input.charCodeAt(t.position); (!te || t.lineIndent < ae) && de === 32; )
        t.lineIndent++, de = t.input.charCodeAt(++t.position);
      if (!te && t.lineIndent > ae && (ae = t.lineIndent), R(de)) {
        ue++;
        continue;
      }
      if (t.lineIndent < ae) {
        V === r ? t.result += e.repeat(`
`, ne ? 1 + ue : ue) : V === l && ne && (t.result += `
`);
        break;
      }
      for (ie ? O(de) ? (Ae = !0, t.result += e.repeat(`
`, ne ? 1 + ue : ue)) : Ae ? (Ae = !1, t.result += e.repeat(`
`, ue + 1)) : ue === 0 ? ne && (t.result += " ") : t.result += e.repeat(`
`, ue) : t.result += e.repeat(`
`, ne ? 1 + ue : ue), ne = !0, te = !0, ue = 0, W = t.position; !R(de) && de !== 0; )
        de = t.input.charCodeAt(++t.position);
      ee(t, W, t.position, !1);
    }
    return !0;
  }
  function y(t, B) {
    var W, ie = t.tag, V = t.anchor, ne = [], te, ae = !1, ue;
    if (t.firstTabInLine !== -1) return !1;
    for (t.anchor !== null && (t.anchorMap[t.anchor] = ne), ue = t.input.charCodeAt(t.position); ue !== 0 && (t.firstTabInLine !== -1 && (t.position = t.firstTabInLine, L(t, "tab characters must not be used in indentation")), !(ue !== 45 || (te = t.input.charCodeAt(t.position + 1), !I(te)))); ) {
      if (ae = !0, t.position++, pe(t, !0, -1) && t.lineIndent <= B) {
        ne.push(null), ue = t.input.charCodeAt(t.position);
        continue;
      }
      if (W = t.line, we(t, B, c, !1, !0), ne.push(t.result), pe(t, !0, -1), ue = t.input.charCodeAt(t.position), (t.line === W || t.lineIndent > B) && ue !== 0)
        L(t, "bad indentation of a sequence entry");
      else if (t.lineIndent < B)
        break;
    }
    return ae ? (t.tag = ie, t.anchor = V, t.kind = "sequence", t.result = ne, !0) : !1;
  }
  function g(t, B, W) {
    var ie, V, ne, te, ae, ue, Ae = t.tag, Re = t.anchor, de = {}, A = /* @__PURE__ */ Object.create(null), j = null, Y = null, z = null, K = !1, oe = !1, re;
    if (t.firstTabInLine !== -1) return !1;
    for (t.anchor !== null && (t.anchorMap[t.anchor] = de), re = t.input.charCodeAt(t.position); re !== 0; ) {
      if (!K && t.firstTabInLine !== -1 && (t.position = t.firstTabInLine, L(t, "tab characters must not be used in indentation")), ie = t.input.charCodeAt(t.position + 1), ne = t.line, (re === 63 || re === 58) && I(ie))
        re === 63 ? (K && (Z(t, de, A, j, Y, null, te, ae, ue), j = Y = z = null), oe = !0, K = !0, V = !0) : K ? (K = !1, V = !0) : L(t, "incomplete explicit mapping pair; a key node is missed; or followed by a non-tabulated empty line"), t.position += 1, re = ie;
      else {
        if (te = t.line, ae = t.lineStart, ue = t.position, !we(t, W, o, !1, !0))
          break;
        if (t.line === ne) {
          for (re = t.input.charCodeAt(t.position); O(re); )
            re = t.input.charCodeAt(++t.position);
          if (re === 58)
            re = t.input.charCodeAt(++t.position), I(re) || L(t, "a whitespace character is expected after the key-value separator within a block mapping"), K && (Z(t, de, A, j, Y, null, te, ae, ue), j = Y = z = null), oe = !0, K = !1, V = !1, j = t.tag, Y = t.result;
          else if (oe)
            L(t, "can not read an implicit mapping pair; a colon is missed");
          else
            return t.tag = Ae, t.anchor = Re, !0;
        } else if (oe)
          L(t, "can not read a block mapping entry; a multiline key may not be an implicit key");
        else
          return t.tag = Ae, t.anchor = Re, !0;
      }
      if ((t.line === ne || t.lineIndent > B) && (K && (te = t.line, ae = t.lineStart, ue = t.position), we(t, B, a, !0, V) && (K ? Y = t.result : z = t.result), K || (Z(t, de, A, j, Y, z, te, ae, ue), j = Y = z = null), pe(t, !0, -1), re = t.input.charCodeAt(t.position)), (t.line === ne || t.lineIndent > B) && re !== 0)
        L(t, "bad indentation of a mapping entry");
      else if (t.lineIndent < B)
        break;
    }
    return K && Z(t, de, A, j, Y, null, te, ae, ue), oe && (t.tag = Ae, t.anchor = Re, t.kind = "mapping", t.result = de), oe;
  }
  function $(t) {
    var B, W = !1, ie = !1, V, ne, te;
    if (te = t.input.charCodeAt(t.position), te !== 33) return !1;
    if (t.tag !== null && L(t, "duplication of a tag property"), te = t.input.charCodeAt(++t.position), te === 60 ? (W = !0, te = t.input.charCodeAt(++t.position)) : te === 33 ? (ie = !0, V = "!!", te = t.input.charCodeAt(++t.position)) : V = "!", B = t.position, W) {
      do
        te = t.input.charCodeAt(++t.position);
      while (te !== 0 && te !== 62);
      t.position < t.length ? (ne = t.input.slice(B, t.position), te = t.input.charCodeAt(++t.position)) : L(t, "unexpected end of the stream within a verbatim tag");
    } else {
      for (; te !== 0 && !I(te); )
        te === 33 && (ie ? L(t, "tag suffix cannot contain exclamation marks") : (V = t.input.slice(B - 1, t.position + 1), v.test(V) || L(t, "named tag handle cannot contain such characters"), ie = !0, B = t.position + 1)), te = t.input.charCodeAt(++t.position);
      ne = t.input.slice(B, t.position), E.test(ne) && L(t, "tag suffix cannot contain flow indicator characters");
    }
    ne && !m.test(ne) && L(t, "tag name cannot contain such characters: " + ne);
    try {
      ne = decodeURIComponent(ne);
    } catch {
      L(t, "tag name is malformed: " + ne);
    }
    return W ? t.tag = ne : d.call(t.tagMap, V) ? t.tag = t.tagMap[V] + ne : V === "!" ? t.tag = "!" + ne : V === "!!" ? t.tag = "tag:yaml.org,2002:" + ne : L(t, 'undeclared tag handle "' + V + '"'), !0;
  }
  function D(t) {
    var B, W;
    if (W = t.input.charCodeAt(t.position), W !== 38) return !1;
    for (t.anchor !== null && L(t, "duplication of an anchor property"), W = t.input.charCodeAt(++t.position), B = t.position; W !== 0 && !I(W) && !b(W); )
      W = t.input.charCodeAt(++t.position);
    return t.position === B && L(t, "name of an anchor node must contain at least one character"), t.anchor = t.input.slice(B, t.position), !0;
  }
  function ye(t) {
    var B, W, ie;
    if (ie = t.input.charCodeAt(t.position), ie !== 42) return !1;
    for (ie = t.input.charCodeAt(++t.position), B = t.position; ie !== 0 && !I(ie) && !b(ie); )
      ie = t.input.charCodeAt(++t.position);
    return t.position === B && L(t, "name of an alias node must contain at least one character"), W = t.input.slice(B, t.position), d.call(t.anchorMap, W) || L(t, 'unidentified alias "' + W + '"'), t.result = t.anchorMap[W], pe(t, !0, -1), !0;
  }
  function we(t, B, W, ie, V) {
    var ne, te, ae, ue = 1, Ae = !1, Re = !1, de, A, j, Y, z, K;
    if (t.listener !== null && t.listener("open", t), t.tag = null, t.anchor = null, t.kind = null, t.result = null, ne = te = ae = a === W || c === W, ie && pe(t, !0, -1) && (Ae = !0, t.lineIndent > B ? ue = 1 : t.lineIndent === B ? ue = 0 : t.lineIndent < B && (ue = -1)), ue === 1)
      for (; $(t) || D(t); )
        pe(t, !0, -1) ? (Ae = !0, ae = ne, t.lineIndent > B ? ue = 1 : t.lineIndent === B ? ue = 0 : t.lineIndent < B && (ue = -1)) : ae = !1;
    if (ae && (ae = Ae || V), (ue === 1 || a === W) && (f === W || o === W ? z = B : z = B + 1, K = t.position - t.lineStart, ue === 1 ? ae && (y(t, K) || g(t, K, z)) || Ce(t, z) ? Re = !0 : (te && _e(t, z) || Te(t, z) || Oe(t, z) ? Re = !0 : ye(t) ? (Re = !0, (t.tag !== null || t.anchor !== null) && L(t, "alias node should not have any properties")) : Ee(t, z, f === W) && (Re = !0, t.tag === null && (t.tag = "?")), t.anchor !== null && (t.anchorMap[t.anchor] = t.result)) : ue === 0 && (Re = ae && y(t, K))), t.tag === null)
      t.anchor !== null && (t.anchorMap[t.anchor] = t.result);
    else if (t.tag === "?") {
      for (t.result !== null && t.kind !== "scalar" && L(t, 'unacceptable node kind for !<?> tag; it should be "scalar", not "' + t.kind + '"'), de = 0, A = t.implicitTypes.length; de < A; de += 1)
        if (Y = t.implicitTypes[de], Y.resolve(t.result)) {
          t.result = Y.construct(t.result), t.tag = Y.tag, t.anchor !== null && (t.anchorMap[t.anchor] = t.result);
          break;
        }
    } else if (t.tag !== "!") {
      if (d.call(t.typeMap[t.kind || "fallback"], t.tag))
        Y = t.typeMap[t.kind || "fallback"][t.tag];
      else
        for (Y = null, j = t.typeMap.multi[t.kind || "fallback"], de = 0, A = j.length; de < A; de += 1)
          if (t.tag.slice(0, j[de].tag.length) === j[de].tag) {
            Y = j[de];
            break;
          }
      Y || L(t, "unknown tag !<" + t.tag + ">"), t.result !== null && Y.kind !== t.kind && L(t, "unacceptable node kind for !<" + t.tag + '> tag; it should be "' + Y.kind + '", not "' + t.kind + '"'), Y.resolve(t.result, t.tag) ? (t.result = Y.construct(t.result, t.tag), t.anchor !== null && (t.anchorMap[t.anchor] = t.result)) : L(t, "cannot resolve a node with !<" + t.tag + "> explicit tag");
    }
    return t.listener !== null && t.listener("close", t), t.tag !== null || t.anchor !== null || Re;
  }
  function Pe(t) {
    var B = t.position, W, ie, V, ne = !1, te;
    for (t.version = null, t.checkLineBreaks = t.legacy, t.tagMap = /* @__PURE__ */ Object.create(null), t.anchorMap = /* @__PURE__ */ Object.create(null); (te = t.input.charCodeAt(t.position)) !== 0 && (pe(t, !0, -1), te = t.input.charCodeAt(t.position), !(t.lineIndent > 0 || te !== 37)); ) {
      for (ne = !0, te = t.input.charCodeAt(++t.position), W = t.position; te !== 0 && !I(te); )
        te = t.input.charCodeAt(++t.position);
      for (ie = t.input.slice(W, t.position), V = [], ie.length < 1 && L(t, "directive name must not be less than one character in length"); te !== 0; ) {
        for (; O(te); )
          te = t.input.charCodeAt(++t.position);
        if (te === 35) {
          do
            te = t.input.charCodeAt(++t.position);
          while (te !== 0 && !R(te));
          break;
        }
        if (R(te)) break;
        for (W = t.position; te !== 0 && !I(te); )
          te = t.input.charCodeAt(++t.position);
        V.push(t.input.slice(W, t.position));
      }
      te !== 0 && ge(t), d.call(X, ie) ? X[ie](t, ie, V) : G(t, 'unknown document directive "' + ie + '"');
    }
    if (pe(t, !0, -1), t.lineIndent === 0 && t.input.charCodeAt(t.position) === 45 && t.input.charCodeAt(t.position + 1) === 45 && t.input.charCodeAt(t.position + 2) === 45 ? (t.position += 3, pe(t, !0, -1)) : ne && L(t, "directives end mark is expected"), we(t, t.lineIndent - 1, a, !1, !0), pe(t, !0, -1), t.checkLineBreaks && p.test(t.input.slice(B, t.position)) && G(t, "non-ASCII line breaks are interpreted as content"), t.documents.push(t.result), t.position === t.lineStart && Q(t)) {
      t.input.charCodeAt(t.position) === 46 && (t.position += 3, pe(t, !0, -1));
      return;
    }
    if (t.position < t.length - 1)
      L(t, "end of the stream or a document separator is expected");
    else
      return;
  }
  function xe(t, B) {
    t = String(t), B = B || {}, t.length !== 0 && (t.charCodeAt(t.length - 1) !== 10 && t.charCodeAt(t.length - 1) !== 13 && (t += `
`), t.charCodeAt(0) === 65279 && (t = t.slice(1)));
    var W = new F(t, B), ie = t.indexOf("\0");
    for (ie !== -1 && (W.position = ie, L(W, "null byte is not allowed in input")), W.input += "\0"; W.input.charCodeAt(W.position) === 32; )
      W.lineIndent += 1, W.position += 1;
    for (; W.position < W.length - 1; )
      Pe(W);
    return W.documents;
  }
  function ke(t, B, W) {
    B !== null && typeof B == "object" && typeof W > "u" && (W = B, B = null);
    var ie = xe(t, W);
    if (typeof B != "function")
      return ie;
    for (var V = 0, ne = ie.length; V < ne; V += 1)
      B(ie[V]);
  }
  function He(t, B) {
    var W = xe(t, B);
    if (W.length !== 0) {
      if (W.length === 1)
        return W[0];
      throw new n("expected a single document in the stream, but found more");
    }
  }
  return Xr.loadAll = ke, Xr.load = He, Xr;
}
var Ei = {}, Es;
function kf() {
  if (Es) return Ei;
  Es = 1;
  var e = Nr(), n = Pr(), h = Ro(), u = Object.prototype.toString, d = Object.prototype.hasOwnProperty, f = 65279, o = 9, c = 10, a = 13, l = 32, s = 33, r = 34, i = 35, p = 37, E = 38, v = 39, m = 42, _ = 44, R = 45, O = 58, I = 61, b = 62, P = 63, C = 64, T = 91, N = 93, w = 96, q = 123, k = 124, M = 125, U = {};
  U[0] = "\\0", U[7] = "\\a", U[8] = "\\b", U[9] = "\\t", U[10] = "\\n", U[11] = "\\v", U[12] = "\\f", U[13] = "\\r", U[27] = "\\e", U[34] = '\\"', U[92] = "\\\\", U[133] = "\\N", U[160] = "\\_", U[8232] = "\\L", U[8233] = "\\P";
  var F = [
    "y",
    "Y",
    "yes",
    "Yes",
    "YES",
    "on",
    "On",
    "ON",
    "n",
    "N",
    "no",
    "No",
    "NO",
    "off",
    "Off",
    "OFF"
  ], H = /^[-+]?[0-9_]+(?::[0-9_]+)+(?:\.[0-9_]*)?$/;
  function L(A, j) {
    var Y, z, K, oe, re, se, fe;
    if (j === null) return {};
    for (Y = {}, z = Object.keys(j), K = 0, oe = z.length; K < oe; K += 1)
      re = z[K], se = String(j[re]), re.slice(0, 2) === "!!" && (re = "tag:yaml.org,2002:" + re.slice(2)), fe = A.compiledTypeMap.fallback[re], fe && d.call(fe.styleAliases, se) && (se = fe.styleAliases[se]), Y[re] = se;
    return Y;
  }
  function G(A) {
    var j, Y, z;
    if (j = A.toString(16).toUpperCase(), A <= 255)
      Y = "x", z = 2;
    else if (A <= 65535)
      Y = "u", z = 4;
    else if (A <= 4294967295)
      Y = "U", z = 8;
    else
      throw new n("code point within a string may not be greater than 0xFFFFFFFF");
    return "\\" + Y + e.repeat("0", z - j.length) + j;
  }
  var X = 1, ee = 2;
  function he(A) {
    this.schema = A.schema || h, this.indent = Math.max(1, A.indent || 2), this.noArrayIndent = A.noArrayIndent || !1, this.skipInvalid = A.skipInvalid || !1, this.flowLevel = e.isNothing(A.flowLevel) ? -1 : A.flowLevel, this.styleMap = L(this.schema, A.styles || null), this.sortKeys = A.sortKeys || !1, this.lineWidth = A.lineWidth || 80, this.noRefs = A.noRefs || !1, this.noCompatMode = A.noCompatMode || !1, this.condenseFlow = A.condenseFlow || !1, this.quotingType = A.quotingType === '"' ? ee : X, this.forceQuotes = A.forceQuotes || !1, this.replacer = typeof A.replacer == "function" ? A.replacer : null, this.implicitTypes = this.schema.compiledImplicit, this.explicitTypes = this.schema.compiledExplicit, this.tag = null, this.result = "", this.duplicates = [], this.usedDuplicates = null;
  }
  function Z(A, j) {
    for (var Y = e.repeat(" ", j), z = 0, K = -1, oe = "", re, se = A.length; z < se; )
      K = A.indexOf(`
`, z), K === -1 ? (re = A.slice(z), z = se) : (re = A.slice(z, K + 1), z = K + 1), re.length && re !== `
` && (oe += Y), oe += re;
    return oe;
  }
  function ge(A, j) {
    return `
` + e.repeat(" ", A.indent * j);
  }
  function pe(A, j) {
    var Y, z, K;
    for (Y = 0, z = A.implicitTypes.length; Y < z; Y += 1)
      if (K = A.implicitTypes[Y], K.resolve(j))
        return !0;
    return !1;
  }
  function Q(A) {
    return A === l || A === o;
  }
  function ce(A) {
    return 32 <= A && A <= 126 || 161 <= A && A <= 55295 && A !== 8232 && A !== 8233 || 57344 <= A && A <= 65533 && A !== f || 65536 <= A && A <= 1114111;
  }
  function Ee(A) {
    return ce(A) && A !== f && A !== a && A !== c;
  }
  function Te(A, j, Y) {
    var z = Ee(A), K = z && !Q(A);
    return (
      // ns-plain-safe
      (Y ? (
        // c = flow-in
        z
      ) : z && A !== _ && A !== T && A !== N && A !== q && A !== M) && A !== i && !(j === O && !K) || Ee(j) && !Q(j) && A === i || j === O && K
    );
  }
  function Oe(A) {
    return ce(A) && A !== f && !Q(A) && A !== R && A !== P && A !== O && A !== _ && A !== T && A !== N && A !== q && A !== M && A !== i && A !== E && A !== m && A !== s && A !== k && A !== I && A !== b && A !== v && A !== r && A !== p && A !== C && A !== w;
  }
  function Ce(A) {
    return !Q(A) && A !== O;
  }
  function _e(A, j) {
    var Y = A.charCodeAt(j), z;
    return Y >= 55296 && Y <= 56319 && j + 1 < A.length && (z = A.charCodeAt(j + 1), z >= 56320 && z <= 57343) ? (Y - 55296) * 1024 + z - 56320 + 65536 : Y;
  }
  function y(A) {
    var j = /^\n* /;
    return j.test(A);
  }
  var g = 1, $ = 2, D = 3, ye = 4, we = 5;
  function Pe(A, j, Y, z, K, oe, re, se) {
    var fe, me = 0, Ne = null, Fe = !1, Se = !1, Bt = z !== -1, tt = -1, Tt = Oe(_e(A, 0)) && Ce(_e(A, A.length - 1));
    if (j || re)
      for (fe = 0; fe < A.length; me >= 65536 ? fe += 2 : fe++) {
        if (me = _e(A, fe), !ce(me))
          return we;
        Tt = Tt && Te(me, Ne, se), Ne = me;
      }
    else {
      for (fe = 0; fe < A.length; me >= 65536 ? fe += 2 : fe++) {
        if (me = _e(A, fe), me === c)
          Fe = !0, Bt && (Se = Se || // Foldable line = too long, and not more-indented.
          fe - tt - 1 > z && A[tt + 1] !== " ", tt = fe);
        else if (!ce(me))
          return we;
        Tt = Tt && Te(me, Ne, se), Ne = me;
      }
      Se = Se || Bt && fe - tt - 1 > z && A[tt + 1] !== " ";
    }
    return !Fe && !Se ? Tt && !re && !K(A) ? g : oe === ee ? we : $ : Y > 9 && y(A) ? we : re ? oe === ee ? we : $ : Se ? ye : D;
  }
  function xe(A, j, Y, z, K) {
    A.dump = (function() {
      if (j.length === 0)
        return A.quotingType === ee ? '""' : "''";
      if (!A.noCompatMode && (F.indexOf(j) !== -1 || H.test(j)))
        return A.quotingType === ee ? '"' + j + '"' : "'" + j + "'";
      var oe = A.indent * Math.max(1, Y), re = A.lineWidth === -1 ? -1 : Math.max(Math.min(A.lineWidth, 40), A.lineWidth - oe), se = z || A.flowLevel > -1 && Y >= A.flowLevel;
      function fe(me) {
        return pe(A, me);
      }
      switch (Pe(
        j,
        se,
        A.indent,
        re,
        fe,
        A.quotingType,
        A.forceQuotes && !z,
        K
      )) {
        case g:
          return j;
        case $:
          return "'" + j.replace(/'/g, "''") + "'";
        case D:
          return "|" + ke(j, A.indent) + He(Z(j, oe));
        case ye:
          return ">" + ke(j, A.indent) + He(Z(t(j, re), oe));
        case we:
          return '"' + W(j) + '"';
        default:
          throw new n("impossible error: invalid scalar style");
      }
    })();
  }
  function ke(A, j) {
    var Y = y(A) ? String(j) : "", z = A[A.length - 1] === `
`, K = z && (A[A.length - 2] === `
` || A === `
`), oe = K ? "+" : z ? "" : "-";
    return Y + oe + `
`;
  }
  function He(A) {
    return A[A.length - 1] === `
` ? A.slice(0, -1) : A;
  }
  function t(A, j) {
    for (var Y = /(\n+)([^\n]*)/g, z = (function() {
      var me = A.indexOf(`
`);
      return me = me !== -1 ? me : A.length, Y.lastIndex = me, B(A.slice(0, me), j);
    })(), K = A[0] === `
` || A[0] === " ", oe, re; re = Y.exec(A); ) {
      var se = re[1], fe = re[2];
      oe = fe[0] === " ", z += se + (!K && !oe && fe !== "" ? `
` : "") + B(fe, j), K = oe;
    }
    return z;
  }
  function B(A, j) {
    if (A === "" || A[0] === " ") return A;
    for (var Y = / [^ ]/g, z, K = 0, oe, re = 0, se = 0, fe = ""; z = Y.exec(A); )
      se = z.index, se - K > j && (oe = re > K ? re : se, fe += `
` + A.slice(K, oe), K = oe + 1), re = se;
    return fe += `
`, A.length - K > j && re > K ? fe += A.slice(K, re) + `
` + A.slice(re + 1) : fe += A.slice(K), fe.slice(1);
  }
  function W(A) {
    for (var j = "", Y = 0, z, K = 0; K < A.length; Y >= 65536 ? K += 2 : K++)
      Y = _e(A, K), z = U[Y], !z && ce(Y) ? (j += A[K], Y >= 65536 && (j += A[K + 1])) : j += z || G(Y);
    return j;
  }
  function ie(A, j, Y) {
    var z = "", K = A.tag, oe, re, se;
    for (oe = 0, re = Y.length; oe < re; oe += 1)
      se = Y[oe], A.replacer && (se = A.replacer.call(Y, String(oe), se)), (ue(A, j, se, !1, !1) || typeof se > "u" && ue(A, j, null, !1, !1)) && (z !== "" && (z += "," + (A.condenseFlow ? "" : " ")), z += A.dump);
    A.tag = K, A.dump = "[" + z + "]";
  }
  function V(A, j, Y, z) {
    var K = "", oe = A.tag, re, se, fe;
    for (re = 0, se = Y.length; re < se; re += 1)
      fe = Y[re], A.replacer && (fe = A.replacer.call(Y, String(re), fe)), (ue(A, j + 1, fe, !0, !0, !1, !0) || typeof fe > "u" && ue(A, j + 1, null, !0, !0, !1, !0)) && ((!z || K !== "") && (K += ge(A, j)), A.dump && c === A.dump.charCodeAt(0) ? K += "-" : K += "- ", K += A.dump);
    A.tag = oe, A.dump = K || "[]";
  }
  function ne(A, j, Y) {
    var z = "", K = A.tag, oe = Object.keys(Y), re, se, fe, me, Ne;
    for (re = 0, se = oe.length; re < se; re += 1)
      Ne = "", z !== "" && (Ne += ", "), A.condenseFlow && (Ne += '"'), fe = oe[re], me = Y[fe], A.replacer && (me = A.replacer.call(Y, fe, me)), ue(A, j, fe, !1, !1) && (A.dump.length > 1024 && (Ne += "? "), Ne += A.dump + (A.condenseFlow ? '"' : "") + ":" + (A.condenseFlow ? "" : " "), ue(A, j, me, !1, !1) && (Ne += A.dump, z += Ne));
    A.tag = K, A.dump = "{" + z + "}";
  }
  function te(A, j, Y, z) {
    var K = "", oe = A.tag, re = Object.keys(Y), se, fe, me, Ne, Fe, Se;
    if (A.sortKeys === !0)
      re.sort();
    else if (typeof A.sortKeys == "function")
      re.sort(A.sortKeys);
    else if (A.sortKeys)
      throw new n("sortKeys must be a boolean or a function");
    for (se = 0, fe = re.length; se < fe; se += 1)
      Se = "", (!z || K !== "") && (Se += ge(A, j)), me = re[se], Ne = Y[me], A.replacer && (Ne = A.replacer.call(Y, me, Ne)), ue(A, j + 1, me, !0, !0, !0) && (Fe = A.tag !== null && A.tag !== "?" || A.dump && A.dump.length > 1024, Fe && (A.dump && c === A.dump.charCodeAt(0) ? Se += "?" : Se += "? "), Se += A.dump, Fe && (Se += ge(A, j)), ue(A, j + 1, Ne, !0, Fe) && (A.dump && c === A.dump.charCodeAt(0) ? Se += ":" : Se += ": ", Se += A.dump, K += Se));
    A.tag = oe, A.dump = K || "{}";
  }
  function ae(A, j, Y) {
    var z, K, oe, re, se, fe;
    for (K = Y ? A.explicitTypes : A.implicitTypes, oe = 0, re = K.length; oe < re; oe += 1)
      if (se = K[oe], (se.instanceOf || se.predicate) && (!se.instanceOf || typeof j == "object" && j instanceof se.instanceOf) && (!se.predicate || se.predicate(j))) {
        if (Y ? se.multi && se.representName ? A.tag = se.representName(j) : A.tag = se.tag : A.tag = "?", se.represent) {
          if (fe = A.styleMap[se.tag] || se.defaultStyle, u.call(se.represent) === "[object Function]")
            z = se.represent(j, fe);
          else if (d.call(se.represent, fe))
            z = se.represent[fe](j, fe);
          else
            throw new n("!<" + se.tag + '> tag resolver accepts not "' + fe + '" style');
          A.dump = z;
        }
        return !0;
      }
    return !1;
  }
  function ue(A, j, Y, z, K, oe, re) {
    A.tag = null, A.dump = Y, ae(A, Y, !1) || ae(A, Y, !0);
    var se = u.call(A.dump), fe = z, me;
    z && (z = A.flowLevel < 0 || A.flowLevel > j);
    var Ne = se === "[object Object]" || se === "[object Array]", Fe, Se;
    if (Ne && (Fe = A.duplicates.indexOf(Y), Se = Fe !== -1), (A.tag !== null && A.tag !== "?" || Se || A.indent !== 2 && j > 0) && (K = !1), Se && A.usedDuplicates[Fe])
      A.dump = "*ref_" + Fe;
    else {
      if (Ne && Se && !A.usedDuplicates[Fe] && (A.usedDuplicates[Fe] = !0), se === "[object Object]")
        z && Object.keys(A.dump).length !== 0 ? (te(A, j, A.dump, K), Se && (A.dump = "&ref_" + Fe + A.dump)) : (ne(A, j, A.dump), Se && (A.dump = "&ref_" + Fe + " " + A.dump));
      else if (se === "[object Array]")
        z && A.dump.length !== 0 ? (A.noArrayIndent && !re && j > 0 ? V(A, j - 1, A.dump, K) : V(A, j, A.dump, K), Se && (A.dump = "&ref_" + Fe + A.dump)) : (ie(A, j, A.dump), Se && (A.dump = "&ref_" + Fe + " " + A.dump));
      else if (se === "[object String]")
        A.tag !== "?" && xe(A, A.dump, j, oe, fe);
      else {
        if (se === "[object Undefined]")
          return !1;
        if (A.skipInvalid) return !1;
        throw new n("unacceptable kind of an object to dump " + se);
      }
      A.tag !== null && A.tag !== "?" && (me = encodeURI(
        A.tag[0] === "!" ? A.tag.slice(1) : A.tag
      ).replace(/!/g, "%21"), A.tag[0] === "!" ? me = "!" + me : me.slice(0, 18) === "tag:yaml.org,2002:" ? me = "!!" + me.slice(18) : me = "!<" + me + ">", A.dump = me + " " + A.dump);
    }
    return !0;
  }
  function Ae(A, j) {
    var Y = [], z = [], K, oe;
    for (Re(A, Y, z), K = 0, oe = z.length; K < oe; K += 1)
      j.duplicates.push(Y[z[K]]);
    j.usedDuplicates = new Array(oe);
  }
  function Re(A, j, Y) {
    var z, K, oe;
    if (A !== null && typeof A == "object")
      if (K = j.indexOf(A), K !== -1)
        Y.indexOf(K) === -1 && Y.push(K);
      else if (j.push(A), Array.isArray(A))
        for (K = 0, oe = A.length; K < oe; K += 1)
          Re(A[K], j, Y);
      else
        for (z = Object.keys(A), K = 0, oe = z.length; K < oe; K += 1)
          Re(A[z[K]], j, Y);
  }
  function de(A, j) {
    j = j || {};
    var Y = new he(j);
    Y.noRefs || Ae(A, Y);
    var z = A;
    return Y.replacer && (z = Y.replacer.call({ "": z }, "", z)), ue(Y, 0, z, !0, !0) ? Y.dump + `
` : "";
  }
  return Ei.dump = de, Ei;
}
var vs;
function bo() {
  if (vs) return Ve;
  vs = 1;
  var e = xf(), n = kf();
  function h(u, d) {
    return function() {
      throw new Error("Function yaml." + u + " is removed in js-yaml 4. Use yaml." + d + " instead, which is now safe by default.");
    };
  }
  return Ve.Type = Xe(), Ve.Schema = gu(), Ve.FAILSAFE_SCHEMA = wu(), Ve.JSON_SCHEMA = bu(), Ve.CORE_SCHEMA = Su(), Ve.DEFAULT_SCHEMA = Ro(), Ve.load = e.load, Ve.loadAll = e.loadAll, Ve.dump = n.dump, Ve.YAMLException = Pr(), Ve.types = {
    binary: Nu(),
    float: Ru(),
    map: yu(),
    null: _u(),
    pairs: Du(),
    set: Iu(),
    timestamp: Cu(),
    bool: Tu(),
    int: Au(),
    merge: Ou(),
    omap: Pu(),
    seq: vu(),
    str: Eu()
  }, Ve.safeLoad = h("safeLoad", "load"), Ve.safeLoadAll = h("safeLoadAll", "loadAll"), Ve.safeDump = h("safeDump", "dump"), Ve;
}
var or = {}, ys;
function qf() {
  if (ys) return or;
  ys = 1, Object.defineProperty(or, "__esModule", { value: !0 }), or.Lazy = void 0;
  class e {
    constructor(h) {
      this._value = null, this.creator = h;
    }
    get hasValue() {
      return this.creator == null;
    }
    get value() {
      if (this.creator == null)
        return this._value;
      const h = this.creator();
      return this.value = h, h;
    }
    set value(h) {
      this._value = h, this.creator = null;
    }
  }
  return or.Lazy = e, or;
}
var Yr = { exports: {} }, vi, ws;
function nn() {
  if (ws) return vi;
  ws = 1;
  const e = "2.0.0", n = 256, h = Number.MAX_SAFE_INTEGER || /* istanbul ignore next */
  9007199254740991, u = 16, d = n - 6;
  return vi = {
    MAX_LENGTH: n,
    MAX_SAFE_COMPONENT_LENGTH: u,
    MAX_SAFE_BUILD_LENGTH: d,
    MAX_SAFE_INTEGER: h,
    RELEASE_TYPES: [
      "major",
      "premajor",
      "minor",
      "preminor",
      "patch",
      "prepatch",
      "prerelease"
    ],
    SEMVER_SPEC_VERSION: e,
    FLAG_INCLUDE_PRERELEASE: 1,
    FLAG_LOOSE: 2
  }, vi;
}
var yi, _s;
function on() {
  return _s || (_s = 1, yi = typeof process == "object" && process.env && process.env.NODE_DEBUG && /\bsemver\b/i.test(process.env.NODE_DEBUG) ? (...n) => console.error("SEMVER", ...n) : () => {
  }), yi;
}
var Ts;
function Dr() {
  return Ts || (Ts = 1, (function(e, n) {
    const {
      MAX_SAFE_COMPONENT_LENGTH: h,
      MAX_SAFE_BUILD_LENGTH: u,
      MAX_LENGTH: d
    } = nn(), f = on();
    n = e.exports = {};
    const o = n.re = [], c = n.safeRe = [], a = n.src = [], l = n.safeSrc = [], s = n.t = {};
    let r = 0;
    const i = "[a-zA-Z0-9-]", p = [
      ["\\s", 1],
      ["\\d", d],
      [i, u]
    ], E = (m) => {
      for (const [_, R] of p)
        m = m.split(`${_}*`).join(`${_}{0,${R}}`).split(`${_}+`).join(`${_}{1,${R}}`);
      return m;
    }, v = (m, _, R) => {
      const O = E(_), I = r++;
      f(m, I, _), s[m] = I, a[I] = _, l[I] = O, o[I] = new RegExp(_, R ? "g" : void 0), c[I] = new RegExp(O, R ? "g" : void 0);
    };
    v("NUMERICIDENTIFIER", "0|[1-9]\\d*"), v("NUMERICIDENTIFIERLOOSE", "\\d+"), v("NONNUMERICIDENTIFIER", `\\d*[a-zA-Z-]${i}*`), v("MAINVERSION", `(${a[s.NUMERICIDENTIFIER]})\\.(${a[s.NUMERICIDENTIFIER]})\\.(${a[s.NUMERICIDENTIFIER]})`), v("MAINVERSIONLOOSE", `(${a[s.NUMERICIDENTIFIERLOOSE]})\\.(${a[s.NUMERICIDENTIFIERLOOSE]})\\.(${a[s.NUMERICIDENTIFIERLOOSE]})`), v("PRERELEASEIDENTIFIER", `(?:${a[s.NONNUMERICIDENTIFIER]}|${a[s.NUMERICIDENTIFIER]})`), v("PRERELEASEIDENTIFIERLOOSE", `(?:${a[s.NONNUMERICIDENTIFIER]}|${a[s.NUMERICIDENTIFIERLOOSE]})`), v("PRERELEASE", `(?:-(${a[s.PRERELEASEIDENTIFIER]}(?:\\.${a[s.PRERELEASEIDENTIFIER]})*))`), v("PRERELEASELOOSE", `(?:-?(${a[s.PRERELEASEIDENTIFIERLOOSE]}(?:\\.${a[s.PRERELEASEIDENTIFIERLOOSE]})*))`), v("BUILDIDENTIFIER", `${i}+`), v("BUILD", `(?:\\+(${a[s.BUILDIDENTIFIER]}(?:\\.${a[s.BUILDIDENTIFIER]})*))`), v("FULLPLAIN", `v?${a[s.MAINVERSION]}${a[s.PRERELEASE]}?${a[s.BUILD]}?`), v("FULL", `^${a[s.FULLPLAIN]}$`), v("LOOSEPLAIN", `[v=\\s]*${a[s.MAINVERSIONLOOSE]}${a[s.PRERELEASELOOSE]}?${a[s.BUILD]}?`), v("LOOSE", `^${a[s.LOOSEPLAIN]}$`), v("GTLT", "((?:<|>)?=?)"), v("XRANGEIDENTIFIERLOOSE", `${a[s.NUMERICIDENTIFIERLOOSE]}|x|X|\\*`), v("XRANGEIDENTIFIER", `${a[s.NUMERICIDENTIFIER]}|x|X|\\*`), v("XRANGEPLAIN", `[v=\\s]*(${a[s.XRANGEIDENTIFIER]})(?:\\.(${a[s.XRANGEIDENTIFIER]})(?:\\.(${a[s.XRANGEIDENTIFIER]})(?:${a[s.PRERELEASE]})?${a[s.BUILD]}?)?)?`), v("XRANGEPLAINLOOSE", `[v=\\s]*(${a[s.XRANGEIDENTIFIERLOOSE]})(?:\\.(${a[s.XRANGEIDENTIFIERLOOSE]})(?:\\.(${a[s.XRANGEIDENTIFIERLOOSE]})(?:${a[s.PRERELEASELOOSE]})?${a[s.BUILD]}?)?)?`), v("XRANGE", `^${a[s.GTLT]}\\s*${a[s.XRANGEPLAIN]}$`), v("XRANGELOOSE", `^${a[s.GTLT]}\\s*${a[s.XRANGEPLAINLOOSE]}$`), v("COERCEPLAIN", `(^|[^\\d])(\\d{1,${h}})(?:\\.(\\d{1,${h}}))?(?:\\.(\\d{1,${h}}))?`), v("COERCE", `${a[s.COERCEPLAIN]}(?:$|[^\\d])`), v("COERCEFULL", a[s.COERCEPLAIN] + `(?:${a[s.PRERELEASE]})?(?:${a[s.BUILD]})?(?:$|[^\\d])`), v("COERCERTL", a[s.COERCE], !0), v("COERCERTLFULL", a[s.COERCEFULL], !0), v("LONETILDE", "(?:~>?)"), v("TILDETRIM", `(\\s*)${a[s.LONETILDE]}\\s+`, !0), n.tildeTrimReplace = "$1~", v("TILDE", `^${a[s.LONETILDE]}${a[s.XRANGEPLAIN]}$`), v("TILDELOOSE", `^${a[s.LONETILDE]}${a[s.XRANGEPLAINLOOSE]}$`), v("LONECARET", "(?:\\^)"), v("CARETTRIM", `(\\s*)${a[s.LONECARET]}\\s+`, !0), n.caretTrimReplace = "$1^", v("CARET", `^${a[s.LONECARET]}${a[s.XRANGEPLAIN]}$`), v("CARETLOOSE", `^${a[s.LONECARET]}${a[s.XRANGEPLAINLOOSE]}$`), v("COMPARATORLOOSE", `^${a[s.GTLT]}\\s*(${a[s.LOOSEPLAIN]})$|^$`), v("COMPARATOR", `^${a[s.GTLT]}\\s*(${a[s.FULLPLAIN]})$|^$`), v("COMPARATORTRIM", `(\\s*)${a[s.GTLT]}\\s*(${a[s.LOOSEPLAIN]}|${a[s.XRANGEPLAIN]})`, !0), n.comparatorTrimReplace = "$1$2$3", v("HYPHENRANGE", `^\\s*(${a[s.XRANGEPLAIN]})\\s+-\\s+(${a[s.XRANGEPLAIN]})\\s*$`), v("HYPHENRANGELOOSE", `^\\s*(${a[s.XRANGEPLAINLOOSE]})\\s+-\\s+(${a[s.XRANGEPLAINLOOSE]})\\s*$`), v("STAR", "(<|>)?=?\\s*\\*"), v("GTE0", "^\\s*>=\\s*0\\.0\\.0\\s*$"), v("GTE0PRE", "^\\s*>=\\s*0\\.0\\.0-0\\s*$");
  })(Yr, Yr.exports)), Yr.exports;
}
var wi, As;
function So() {
  if (As) return wi;
  As = 1;
  const e = Object.freeze({ loose: !0 }), n = Object.freeze({});
  return wi = (u) => u ? typeof u != "object" ? e : u : n, wi;
}
var _i, Rs;
function Lu() {
  if (Rs) return _i;
  Rs = 1;
  const e = /^[0-9]+$/, n = (u, d) => {
    if (typeof u == "number" && typeof d == "number")
      return u === d ? 0 : u < d ? -1 : 1;
    const f = e.test(u), o = e.test(d);
    return f && o && (u = +u, d = +d), u === d ? 0 : f && !o ? -1 : o && !f ? 1 : u < d ? -1 : 1;
  };
  return _i = {
    compareIdentifiers: n,
    rcompareIdentifiers: (u, d) => n(d, u)
  }, _i;
}
var Ti, bs;
function Ye() {
  if (bs) return Ti;
  bs = 1;
  const e = on(), { MAX_LENGTH: n, MAX_SAFE_INTEGER: h } = nn(), { safeRe: u, t: d } = Dr(), f = So(), { compareIdentifiers: o } = Lu();
  class c {
    constructor(l, s) {
      if (s = f(s), l instanceof c) {
        if (l.loose === !!s.loose && l.includePrerelease === !!s.includePrerelease)
          return l;
        l = l.version;
      } else if (typeof l != "string")
        throw new TypeError(`Invalid version. Must be a string. Got type "${typeof l}".`);
      if (l.length > n)
        throw new TypeError(
          `version is longer than ${n} characters`
        );
      e("SemVer", l, s), this.options = s, this.loose = !!s.loose, this.includePrerelease = !!s.includePrerelease;
      const r = l.trim().match(s.loose ? u[d.LOOSE] : u[d.FULL]);
      if (!r)
        throw new TypeError(`Invalid Version: ${l}`);
      if (this.raw = l, this.major = +r[1], this.minor = +r[2], this.patch = +r[3], this.major > h || this.major < 0)
        throw new TypeError("Invalid major version");
      if (this.minor > h || this.minor < 0)
        throw new TypeError("Invalid minor version");
      if (this.patch > h || this.patch < 0)
        throw new TypeError("Invalid patch version");
      r[4] ? this.prerelease = r[4].split(".").map((i) => {
        if (/^[0-9]+$/.test(i)) {
          const p = +i;
          if (p >= 0 && p < h)
            return p;
        }
        return i;
      }) : this.prerelease = [], this.build = r[5] ? r[5].split(".") : [], this.format();
    }
    format() {
      return this.version = `${this.major}.${this.minor}.${this.patch}`, this.prerelease.length && (this.version += `-${this.prerelease.join(".")}`), this.version;
    }
    toString() {
      return this.version;
    }
    compare(l) {
      if (e("SemVer.compare", this.version, this.options, l), !(l instanceof c)) {
        if (typeof l == "string" && l === this.version)
          return 0;
        l = new c(l, this.options);
      }
      return l.version === this.version ? 0 : this.compareMain(l) || this.comparePre(l);
    }
    compareMain(l) {
      return l instanceof c || (l = new c(l, this.options)), this.major < l.major ? -1 : this.major > l.major ? 1 : this.minor < l.minor ? -1 : this.minor > l.minor ? 1 : this.patch < l.patch ? -1 : this.patch > l.patch ? 1 : 0;
    }
    comparePre(l) {
      if (l instanceof c || (l = new c(l, this.options)), this.prerelease.length && !l.prerelease.length)
        return -1;
      if (!this.prerelease.length && l.prerelease.length)
        return 1;
      if (!this.prerelease.length && !l.prerelease.length)
        return 0;
      let s = 0;
      do {
        const r = this.prerelease[s], i = l.prerelease[s];
        if (e("prerelease compare", s, r, i), r === void 0 && i === void 0)
          return 0;
        if (i === void 0)
          return 1;
        if (r === void 0)
          return -1;
        if (r === i)
          continue;
        return o(r, i);
      } while (++s);
    }
    compareBuild(l) {
      l instanceof c || (l = new c(l, this.options));
      let s = 0;
      do {
        const r = this.build[s], i = l.build[s];
        if (e("build compare", s, r, i), r === void 0 && i === void 0)
          return 0;
        if (i === void 0)
          return 1;
        if (r === void 0)
          return -1;
        if (r === i)
          continue;
        return o(r, i);
      } while (++s);
    }
    // preminor will bump the version up to the next minor release, and immediately
    // down to pre-release. premajor and prepatch work the same way.
    inc(l, s, r) {
      if (l.startsWith("pre")) {
        if (!s && r === !1)
          throw new Error("invalid increment argument: identifier is empty");
        if (s) {
          const i = `-${s}`.match(this.options.loose ? u[d.PRERELEASELOOSE] : u[d.PRERELEASE]);
          if (!i || i[1] !== s)
            throw new Error(`invalid identifier: ${s}`);
        }
      }
      switch (l) {
        case "premajor":
          this.prerelease.length = 0, this.patch = 0, this.minor = 0, this.major++, this.inc("pre", s, r);
          break;
        case "preminor":
          this.prerelease.length = 0, this.patch = 0, this.minor++, this.inc("pre", s, r);
          break;
        case "prepatch":
          this.prerelease.length = 0, this.inc("patch", s, r), this.inc("pre", s, r);
          break;
        // If the input is a non-prerelease version, this acts the same as
        // prepatch.
        case "prerelease":
          this.prerelease.length === 0 && this.inc("patch", s, r), this.inc("pre", s, r);
          break;
        case "release":
          if (this.prerelease.length === 0)
            throw new Error(`version ${this.raw} is not a prerelease`);
          this.prerelease.length = 0;
          break;
        case "major":
          (this.minor !== 0 || this.patch !== 0 || this.prerelease.length === 0) && this.major++, this.minor = 0, this.patch = 0, this.prerelease = [];
          break;
        case "minor":
          (this.patch !== 0 || this.prerelease.length === 0) && this.minor++, this.patch = 0, this.prerelease = [];
          break;
        case "patch":
          this.prerelease.length === 0 && this.patch++, this.prerelease = [];
          break;
        // This probably shouldn't be used publicly.
        // 1.0.0 'pre' would become 1.0.0-0 which is the wrong direction.
        case "pre": {
          const i = Number(r) ? 1 : 0;
          if (this.prerelease.length === 0)
            this.prerelease = [i];
          else {
            let p = this.prerelease.length;
            for (; --p >= 0; )
              typeof this.prerelease[p] == "number" && (this.prerelease[p]++, p = -2);
            if (p === -1) {
              if (s === this.prerelease.join(".") && r === !1)
                throw new Error("invalid increment argument: identifier already exists");
              this.prerelease.push(i);
            }
          }
          if (s) {
            let p = [s, i];
            r === !1 && (p = [s]), o(this.prerelease[0], s) === 0 ? isNaN(this.prerelease[1]) && (this.prerelease = p) : this.prerelease = p;
          }
          break;
        }
        default:
          throw new Error(`invalid increment argument: ${l}`);
      }
      return this.raw = this.format(), this.build.length && (this.raw += `+${this.build.join(".")}`), this;
    }
  }
  return Ti = c, Ti;
}
var Ai, Ss;
function Qt() {
  if (Ss) return Ai;
  Ss = 1;
  const e = Ye();
  return Ai = (h, u, d = !1) => {
    if (h instanceof e)
      return h;
    try {
      return new e(h, u);
    } catch (f) {
      if (!d)
        return null;
      throw f;
    }
  }, Ai;
}
var Ri, Cs;
function $f() {
  if (Cs) return Ri;
  Cs = 1;
  const e = Qt();
  return Ri = (h, u) => {
    const d = e(h, u);
    return d ? d.version : null;
  }, Ri;
}
var bi, Os;
function Mf() {
  if (Os) return bi;
  Os = 1;
  const e = Qt();
  return bi = (h, u) => {
    const d = e(h.trim().replace(/^[=v]+/, ""), u);
    return d ? d.version : null;
  }, bi;
}
var Si, Ns;
function Bf() {
  if (Ns) return Si;
  Ns = 1;
  const e = Ye();
  return Si = (h, u, d, f, o) => {
    typeof d == "string" && (o = f, f = d, d = void 0);
    try {
      return new e(
        h instanceof e ? h.version : h,
        d
      ).inc(u, f, o).version;
    } catch {
      return null;
    }
  }, Si;
}
var Ci, Ps;
function jf() {
  if (Ps) return Ci;
  Ps = 1;
  const e = Qt();
  return Ci = (h, u) => {
    const d = e(h, null, !0), f = e(u, null, !0), o = d.compare(f);
    if (o === 0)
      return null;
    const c = o > 0, a = c ? d : f, l = c ? f : d, s = !!a.prerelease.length;
    if (!!l.prerelease.length && !s) {
      if (!l.patch && !l.minor)
        return "major";
      if (l.compareMain(a) === 0)
        return l.minor && !l.patch ? "minor" : "patch";
    }
    const i = s ? "pre" : "";
    return d.major !== f.major ? i + "major" : d.minor !== f.minor ? i + "minor" : d.patch !== f.patch ? i + "patch" : "prerelease";
  }, Ci;
}
var Oi, Ds;
function Hf() {
  if (Ds) return Oi;
  Ds = 1;
  const e = Ye();
  return Oi = (h, u) => new e(h, u).major, Oi;
}
var Ni, Is;
function Gf() {
  if (Is) return Ni;
  Is = 1;
  const e = Ye();
  return Ni = (h, u) => new e(h, u).minor, Ni;
}
var Pi, Ls;
function Wf() {
  if (Ls) return Pi;
  Ls = 1;
  const e = Ye();
  return Pi = (h, u) => new e(h, u).patch, Pi;
}
var Di, Fs;
function Vf() {
  if (Fs) return Di;
  Fs = 1;
  const e = Qt();
  return Di = (h, u) => {
    const d = e(h, u);
    return d && d.prerelease.length ? d.prerelease : null;
  }, Di;
}
var Ii, Us;
function at() {
  if (Us) return Ii;
  Us = 1;
  const e = Ye();
  return Ii = (h, u, d) => new e(h, d).compare(new e(u, d)), Ii;
}
var Li, xs;
function Xf() {
  if (xs) return Li;
  xs = 1;
  const e = at();
  return Li = (h, u, d) => e(u, h, d), Li;
}
var Fi, ks;
function Yf() {
  if (ks) return Fi;
  ks = 1;
  const e = at();
  return Fi = (h, u) => e(h, u, !0), Fi;
}
var Ui, qs;
function Co() {
  if (qs) return Ui;
  qs = 1;
  const e = Ye();
  return Ui = (h, u, d) => {
    const f = new e(h, d), o = new e(u, d);
    return f.compare(o) || f.compareBuild(o);
  }, Ui;
}
var xi, $s;
function zf() {
  if ($s) return xi;
  $s = 1;
  const e = Co();
  return xi = (h, u) => h.sort((d, f) => e(d, f, u)), xi;
}
var ki, Ms;
function Kf() {
  if (Ms) return ki;
  Ms = 1;
  const e = Co();
  return ki = (h, u) => h.sort((d, f) => e(f, d, u)), ki;
}
var qi, Bs;
function an() {
  if (Bs) return qi;
  Bs = 1;
  const e = at();
  return qi = (h, u, d) => e(h, u, d) > 0, qi;
}
var $i, js;
function Oo() {
  if (js) return $i;
  js = 1;
  const e = at();
  return $i = (h, u, d) => e(h, u, d) < 0, $i;
}
var Mi, Hs;
function Fu() {
  if (Hs) return Mi;
  Hs = 1;
  const e = at();
  return Mi = (h, u, d) => e(h, u, d) === 0, Mi;
}
var Bi, Gs;
function Uu() {
  if (Gs) return Bi;
  Gs = 1;
  const e = at();
  return Bi = (h, u, d) => e(h, u, d) !== 0, Bi;
}
var ji, Ws;
function No() {
  if (Ws) return ji;
  Ws = 1;
  const e = at();
  return ji = (h, u, d) => e(h, u, d) >= 0, ji;
}
var Hi, Vs;
function Po() {
  if (Vs) return Hi;
  Vs = 1;
  const e = at();
  return Hi = (h, u, d) => e(h, u, d) <= 0, Hi;
}
var Gi, Xs;
function xu() {
  if (Xs) return Gi;
  Xs = 1;
  const e = Fu(), n = Uu(), h = an(), u = No(), d = Oo(), f = Po();
  return Gi = (c, a, l, s) => {
    switch (a) {
      case "===":
        return typeof c == "object" && (c = c.version), typeof l == "object" && (l = l.version), c === l;
      case "!==":
        return typeof c == "object" && (c = c.version), typeof l == "object" && (l = l.version), c !== l;
      case "":
      case "=":
      case "==":
        return e(c, l, s);
      case "!=":
        return n(c, l, s);
      case ">":
        return h(c, l, s);
      case ">=":
        return u(c, l, s);
      case "<":
        return d(c, l, s);
      case "<=":
        return f(c, l, s);
      default:
        throw new TypeError(`Invalid operator: ${a}`);
    }
  }, Gi;
}
var Wi, Ys;
function Jf() {
  if (Ys) return Wi;
  Ys = 1;
  const e = Ye(), n = Qt(), { safeRe: h, t: u } = Dr();
  return Wi = (f, o) => {
    if (f instanceof e)
      return f;
    if (typeof f == "number" && (f = String(f)), typeof f != "string")
      return null;
    o = o || {};
    let c = null;
    if (!o.rtl)
      c = f.match(o.includePrerelease ? h[u.COERCEFULL] : h[u.COERCE]);
    else {
      const p = o.includePrerelease ? h[u.COERCERTLFULL] : h[u.COERCERTL];
      let E;
      for (; (E = p.exec(f)) && (!c || c.index + c[0].length !== f.length); )
        (!c || E.index + E[0].length !== c.index + c[0].length) && (c = E), p.lastIndex = E.index + E[1].length + E[2].length;
      p.lastIndex = -1;
    }
    if (c === null)
      return null;
    const a = c[2], l = c[3] || "0", s = c[4] || "0", r = o.includePrerelease && c[5] ? `-${c[5]}` : "", i = o.includePrerelease && c[6] ? `+${c[6]}` : "";
    return n(`${a}.${l}.${s}${r}${i}`, o);
  }, Wi;
}
var Vi, zs;
function Qf() {
  if (zs) return Vi;
  zs = 1;
  class e {
    constructor() {
      this.max = 1e3, this.map = /* @__PURE__ */ new Map();
    }
    get(h) {
      const u = this.map.get(h);
      if (u !== void 0)
        return this.map.delete(h), this.map.set(h, u), u;
    }
    delete(h) {
      return this.map.delete(h);
    }
    set(h, u) {
      if (!this.delete(h) && u !== void 0) {
        if (this.map.size >= this.max) {
          const f = this.map.keys().next().value;
          this.delete(f);
        }
        this.map.set(h, u);
      }
      return this;
    }
  }
  return Vi = e, Vi;
}
var Xi, Ks;
function st() {
  if (Ks) return Xi;
  Ks = 1;
  const e = /\s+/g;
  class n {
    constructor(F, H) {
      if (H = d(H), F instanceof n)
        return F.loose === !!H.loose && F.includePrerelease === !!H.includePrerelease ? F : new n(F.raw, H);
      if (F instanceof f)
        return this.raw = F.value, this.set = [[F]], this.formatted = void 0, this;
      if (this.options = H, this.loose = !!H.loose, this.includePrerelease = !!H.includePrerelease, this.raw = F.trim().replace(e, " "), this.set = this.raw.split("||").map((L) => this.parseRange(L.trim())).filter((L) => L.length), !this.set.length)
        throw new TypeError(`Invalid SemVer Range: ${this.raw}`);
      if (this.set.length > 1) {
        const L = this.set[0];
        if (this.set = this.set.filter((G) => !v(G[0])), this.set.length === 0)
          this.set = [L];
        else if (this.set.length > 1) {
          for (const G of this.set)
            if (G.length === 1 && m(G[0])) {
              this.set = [G];
              break;
            }
        }
      }
      this.formatted = void 0;
    }
    get range() {
      if (this.formatted === void 0) {
        this.formatted = "";
        for (let F = 0; F < this.set.length; F++) {
          F > 0 && (this.formatted += "||");
          const H = this.set[F];
          for (let L = 0; L < H.length; L++)
            L > 0 && (this.formatted += " "), this.formatted += H[L].toString().trim();
        }
      }
      return this.formatted;
    }
    format() {
      return this.range;
    }
    toString() {
      return this.range;
    }
    parseRange(F) {
      const L = ((this.options.includePrerelease && p) | (this.options.loose && E)) + ":" + F, G = u.get(L);
      if (G)
        return G;
      const X = this.options.loose, ee = X ? a[l.HYPHENRANGELOOSE] : a[l.HYPHENRANGE];
      F = F.replace(ee, k(this.options.includePrerelease)), o("hyphen replace", F), F = F.replace(a[l.COMPARATORTRIM], s), o("comparator trim", F), F = F.replace(a[l.TILDETRIM], r), o("tilde trim", F), F = F.replace(a[l.CARETTRIM], i), o("caret trim", F);
      let he = F.split(" ").map((Q) => R(Q, this.options)).join(" ").split(/\s+/).map((Q) => q(Q, this.options));
      X && (he = he.filter((Q) => (o("loose invalid filter", Q, this.options), !!Q.match(a[l.COMPARATORLOOSE])))), o("range list", he);
      const Z = /* @__PURE__ */ new Map(), ge = he.map((Q) => new f(Q, this.options));
      for (const Q of ge) {
        if (v(Q))
          return [Q];
        Z.set(Q.value, Q);
      }
      Z.size > 1 && Z.has("") && Z.delete("");
      const pe = [...Z.values()];
      return u.set(L, pe), pe;
    }
    intersects(F, H) {
      if (!(F instanceof n))
        throw new TypeError("a Range is required");
      return this.set.some((L) => _(L, H) && F.set.some((G) => _(G, H) && L.every((X) => G.every((ee) => X.intersects(ee, H)))));
    }
    // if ANY of the sets match ALL of its comparators, then pass
    test(F) {
      if (!F)
        return !1;
      if (typeof F == "string")
        try {
          F = new c(F, this.options);
        } catch {
          return !1;
        }
      for (let H = 0; H < this.set.length; H++)
        if (M(this.set[H], F, this.options))
          return !0;
      return !1;
    }
  }
  Xi = n;
  const h = Qf(), u = new h(), d = So(), f = sn(), o = on(), c = Ye(), {
    safeRe: a,
    t: l,
    comparatorTrimReplace: s,
    tildeTrimReplace: r,
    caretTrimReplace: i
  } = Dr(), { FLAG_INCLUDE_PRERELEASE: p, FLAG_LOOSE: E } = nn(), v = (U) => U.value === "<0.0.0-0", m = (U) => U.value === "", _ = (U, F) => {
    let H = !0;
    const L = U.slice();
    let G = L.pop();
    for (; H && L.length; )
      H = L.every((X) => G.intersects(X, F)), G = L.pop();
    return H;
  }, R = (U, F) => (U = U.replace(a[l.BUILD], ""), o("comp", U, F), U = P(U, F), o("caret", U), U = I(U, F), o("tildes", U), U = T(U, F), o("xrange", U), U = w(U, F), o("stars", U), U), O = (U) => !U || U.toLowerCase() === "x" || U === "*", I = (U, F) => U.trim().split(/\s+/).map((H) => b(H, F)).join(" "), b = (U, F) => {
    const H = F.loose ? a[l.TILDELOOSE] : a[l.TILDE];
    return U.replace(H, (L, G, X, ee, he) => {
      o("tilde", U, L, G, X, ee, he);
      let Z;
      return O(G) ? Z = "" : O(X) ? Z = `>=${G}.0.0 <${+G + 1}.0.0-0` : O(ee) ? Z = `>=${G}.${X}.0 <${G}.${+X + 1}.0-0` : he ? (o("replaceTilde pr", he), Z = `>=${G}.${X}.${ee}-${he} <${G}.${+X + 1}.0-0`) : Z = `>=${G}.${X}.${ee} <${G}.${+X + 1}.0-0`, o("tilde return", Z), Z;
    });
  }, P = (U, F) => U.trim().split(/\s+/).map((H) => C(H, F)).join(" "), C = (U, F) => {
    o("caret", U, F);
    const H = F.loose ? a[l.CARETLOOSE] : a[l.CARET], L = F.includePrerelease ? "-0" : "";
    return U.replace(H, (G, X, ee, he, Z) => {
      o("caret", U, G, X, ee, he, Z);
      let ge;
      return O(X) ? ge = "" : O(ee) ? ge = `>=${X}.0.0${L} <${+X + 1}.0.0-0` : O(he) ? X === "0" ? ge = `>=${X}.${ee}.0${L} <${X}.${+ee + 1}.0-0` : ge = `>=${X}.${ee}.0${L} <${+X + 1}.0.0-0` : Z ? (o("replaceCaret pr", Z), X === "0" ? ee === "0" ? ge = `>=${X}.${ee}.${he}-${Z} <${X}.${ee}.${+he + 1}-0` : ge = `>=${X}.${ee}.${he}-${Z} <${X}.${+ee + 1}.0-0` : ge = `>=${X}.${ee}.${he}-${Z} <${+X + 1}.0.0-0`) : (o("no pr"), X === "0" ? ee === "0" ? ge = `>=${X}.${ee}.${he}${L} <${X}.${ee}.${+he + 1}-0` : ge = `>=${X}.${ee}.${he}${L} <${X}.${+ee + 1}.0-0` : ge = `>=${X}.${ee}.${he} <${+X + 1}.0.0-0`), o("caret return", ge), ge;
    });
  }, T = (U, F) => (o("replaceXRanges", U, F), U.split(/\s+/).map((H) => N(H, F)).join(" ")), N = (U, F) => {
    U = U.trim();
    const H = F.loose ? a[l.XRANGELOOSE] : a[l.XRANGE];
    return U.replace(H, (L, G, X, ee, he, Z) => {
      o("xRange", U, L, G, X, ee, he, Z);
      const ge = O(X), pe = ge || O(ee), Q = pe || O(he), ce = Q;
      return G === "=" && ce && (G = ""), Z = F.includePrerelease ? "-0" : "", ge ? G === ">" || G === "<" ? L = "<0.0.0-0" : L = "*" : G && ce ? (pe && (ee = 0), he = 0, G === ">" ? (G = ">=", pe ? (X = +X + 1, ee = 0, he = 0) : (ee = +ee + 1, he = 0)) : G === "<=" && (G = "<", pe ? X = +X + 1 : ee = +ee + 1), G === "<" && (Z = "-0"), L = `${G + X}.${ee}.${he}${Z}`) : pe ? L = `>=${X}.0.0${Z} <${+X + 1}.0.0-0` : Q && (L = `>=${X}.${ee}.0${Z} <${X}.${+ee + 1}.0-0`), o("xRange return", L), L;
    });
  }, w = (U, F) => (o("replaceStars", U, F), U.trim().replace(a[l.STAR], "")), q = (U, F) => (o("replaceGTE0", U, F), U.trim().replace(a[F.includePrerelease ? l.GTE0PRE : l.GTE0], "")), k = (U) => (F, H, L, G, X, ee, he, Z, ge, pe, Q, ce) => (O(L) ? H = "" : O(G) ? H = `>=${L}.0.0${U ? "-0" : ""}` : O(X) ? H = `>=${L}.${G}.0${U ? "-0" : ""}` : ee ? H = `>=${H}` : H = `>=${H}${U ? "-0" : ""}`, O(ge) ? Z = "" : O(pe) ? Z = `<${+ge + 1}.0.0-0` : O(Q) ? Z = `<${ge}.${+pe + 1}.0-0` : ce ? Z = `<=${ge}.${pe}.${Q}-${ce}` : U ? Z = `<${ge}.${pe}.${+Q + 1}-0` : Z = `<=${Z}`, `${H} ${Z}`.trim()), M = (U, F, H) => {
    for (let L = 0; L < U.length; L++)
      if (!U[L].test(F))
        return !1;
    if (F.prerelease.length && !H.includePrerelease) {
      for (let L = 0; L < U.length; L++)
        if (o(U[L].semver), U[L].semver !== f.ANY && U[L].semver.prerelease.length > 0) {
          const G = U[L].semver;
          if (G.major === F.major && G.minor === F.minor && G.patch === F.patch)
            return !0;
        }
      return !1;
    }
    return !0;
  };
  return Xi;
}
var Yi, Js;
function sn() {
  if (Js) return Yi;
  Js = 1;
  const e = /* @__PURE__ */ Symbol("SemVer ANY");
  class n {
    static get ANY() {
      return e;
    }
    constructor(s, r) {
      if (r = h(r), s instanceof n) {
        if (s.loose === !!r.loose)
          return s;
        s = s.value;
      }
      s = s.trim().split(/\s+/).join(" "), o("comparator", s, r), this.options = r, this.loose = !!r.loose, this.parse(s), this.semver === e ? this.value = "" : this.value = this.operator + this.semver.version, o("comp", this);
    }
    parse(s) {
      const r = this.options.loose ? u[d.COMPARATORLOOSE] : u[d.COMPARATOR], i = s.match(r);
      if (!i)
        throw new TypeError(`Invalid comparator: ${s}`);
      this.operator = i[1] !== void 0 ? i[1] : "", this.operator === "=" && (this.operator = ""), i[2] ? this.semver = new c(i[2], this.options.loose) : this.semver = e;
    }
    toString() {
      return this.value;
    }
    test(s) {
      if (o("Comparator.test", s, this.options.loose), this.semver === e || s === e)
        return !0;
      if (typeof s == "string")
        try {
          s = new c(s, this.options);
        } catch {
          return !1;
        }
      return f(s, this.operator, this.semver, this.options);
    }
    intersects(s, r) {
      if (!(s instanceof n))
        throw new TypeError("a Comparator is required");
      return this.operator === "" ? this.value === "" ? !0 : new a(s.value, r).test(this.value) : s.operator === "" ? s.value === "" ? !0 : new a(this.value, r).test(s.semver) : (r = h(r), r.includePrerelease && (this.value === "<0.0.0-0" || s.value === "<0.0.0-0") || !r.includePrerelease && (this.value.startsWith("<0.0.0") || s.value.startsWith("<0.0.0")) ? !1 : !!(this.operator.startsWith(">") && s.operator.startsWith(">") || this.operator.startsWith("<") && s.operator.startsWith("<") || this.semver.version === s.semver.version && this.operator.includes("=") && s.operator.includes("=") || f(this.semver, "<", s.semver, r) && this.operator.startsWith(">") && s.operator.startsWith("<") || f(this.semver, ">", s.semver, r) && this.operator.startsWith("<") && s.operator.startsWith(">")));
    }
  }
  Yi = n;
  const h = So(), { safeRe: u, t: d } = Dr(), f = xu(), o = on(), c = Ye(), a = st();
  return Yi;
}
var zi, Qs;
function ln() {
  if (Qs) return zi;
  Qs = 1;
  const e = st();
  return zi = (h, u, d) => {
    try {
      u = new e(u, d);
    } catch {
      return !1;
    }
    return u.test(h);
  }, zi;
}
var Ki, Zs;
function Zf() {
  if (Zs) return Ki;
  Zs = 1;
  const e = st();
  return Ki = (h, u) => new e(h, u).set.map((d) => d.map((f) => f.value).join(" ").trim().split(" ")), Ki;
}
var Ji, el;
function ed() {
  if (el) return Ji;
  el = 1;
  const e = Ye(), n = st();
  return Ji = (u, d, f) => {
    let o = null, c = null, a = null;
    try {
      a = new n(d, f);
    } catch {
      return null;
    }
    return u.forEach((l) => {
      a.test(l) && (!o || c.compare(l) === -1) && (o = l, c = new e(o, f));
    }), o;
  }, Ji;
}
var Qi, tl;
function td() {
  if (tl) return Qi;
  tl = 1;
  const e = Ye(), n = st();
  return Qi = (u, d, f) => {
    let o = null, c = null, a = null;
    try {
      a = new n(d, f);
    } catch {
      return null;
    }
    return u.forEach((l) => {
      a.test(l) && (!o || c.compare(l) === 1) && (o = l, c = new e(o, f));
    }), o;
  }, Qi;
}
var Zi, rl;
function rd() {
  if (rl) return Zi;
  rl = 1;
  const e = Ye(), n = st(), h = an();
  return Zi = (d, f) => {
    d = new n(d, f);
    let o = new e("0.0.0");
    if (d.test(o) || (o = new e("0.0.0-0"), d.test(o)))
      return o;
    o = null;
    for (let c = 0; c < d.set.length; ++c) {
      const a = d.set[c];
      let l = null;
      a.forEach((s) => {
        const r = new e(s.semver.version);
        switch (s.operator) {
          case ">":
            r.prerelease.length === 0 ? r.patch++ : r.prerelease.push(0), r.raw = r.format();
          /* fallthrough */
          case "":
          case ">=":
            (!l || h(r, l)) && (l = r);
            break;
          case "<":
          case "<=":
            break;
          /* istanbul ignore next */
          default:
            throw new Error(`Unexpected operation: ${s.operator}`);
        }
      }), l && (!o || h(o, l)) && (o = l);
    }
    return o && d.test(o) ? o : null;
  }, Zi;
}
var eo, nl;
function nd() {
  if (nl) return eo;
  nl = 1;
  const e = st();
  return eo = (h, u) => {
    try {
      return new e(h, u).range || "*";
    } catch {
      return null;
    }
  }, eo;
}
var to, il;
function Do() {
  if (il) return to;
  il = 1;
  const e = Ye(), n = sn(), { ANY: h } = n, u = st(), d = ln(), f = an(), o = Oo(), c = Po(), a = No();
  return to = (s, r, i, p) => {
    s = new e(s, p), r = new u(r, p);
    let E, v, m, _, R;
    switch (i) {
      case ">":
        E = f, v = c, m = o, _ = ">", R = ">=";
        break;
      case "<":
        E = o, v = a, m = f, _ = "<", R = "<=";
        break;
      default:
        throw new TypeError('Must provide a hilo val of "<" or ">"');
    }
    if (d(s, r, p))
      return !1;
    for (let O = 0; O < r.set.length; ++O) {
      const I = r.set[O];
      let b = null, P = null;
      if (I.forEach((C) => {
        C.semver === h && (C = new n(">=0.0.0")), b = b || C, P = P || C, E(C.semver, b.semver, p) ? b = C : m(C.semver, P.semver, p) && (P = C);
      }), b.operator === _ || b.operator === R || (!P.operator || P.operator === _) && v(s, P.semver))
        return !1;
      if (P.operator === R && m(s, P.semver))
        return !1;
    }
    return !0;
  }, to;
}
var ro, ol;
function id() {
  if (ol) return ro;
  ol = 1;
  const e = Do();
  return ro = (h, u, d) => e(h, u, ">", d), ro;
}
var no, al;
function od() {
  if (al) return no;
  al = 1;
  const e = Do();
  return no = (h, u, d) => e(h, u, "<", d), no;
}
var io, sl;
function ad() {
  if (sl) return io;
  sl = 1;
  const e = st();
  return io = (h, u, d) => (h = new e(h, d), u = new e(u, d), h.intersects(u, d)), io;
}
var oo, ll;
function sd() {
  if (ll) return oo;
  ll = 1;
  const e = ln(), n = at();
  return oo = (h, u, d) => {
    const f = [];
    let o = null, c = null;
    const a = h.sort((i, p) => n(i, p, d));
    for (const i of a)
      e(i, u, d) ? (c = i, o || (o = i)) : (c && f.push([o, c]), c = null, o = null);
    o && f.push([o, null]);
    const l = [];
    for (const [i, p] of f)
      i === p ? l.push(i) : !p && i === a[0] ? l.push("*") : p ? i === a[0] ? l.push(`<=${p}`) : l.push(`${i} - ${p}`) : l.push(`>=${i}`);
    const s = l.join(" || "), r = typeof u.raw == "string" ? u.raw : String(u);
    return s.length < r.length ? s : u;
  }, oo;
}
var ao, ul;
function ld() {
  if (ul) return ao;
  ul = 1;
  const e = st(), n = sn(), { ANY: h } = n, u = ln(), d = at(), f = (r, i, p = {}) => {
    if (r === i)
      return !0;
    r = new e(r, p), i = new e(i, p);
    let E = !1;
    e: for (const v of r.set) {
      for (const m of i.set) {
        const _ = a(v, m, p);
        if (E = E || _ !== null, _)
          continue e;
      }
      if (E)
        return !1;
    }
    return !0;
  }, o = [new n(">=0.0.0-0")], c = [new n(">=0.0.0")], a = (r, i, p) => {
    if (r === i)
      return !0;
    if (r.length === 1 && r[0].semver === h) {
      if (i.length === 1 && i[0].semver === h)
        return !0;
      p.includePrerelease ? r = o : r = c;
    }
    if (i.length === 1 && i[0].semver === h) {
      if (p.includePrerelease)
        return !0;
      i = c;
    }
    const E = /* @__PURE__ */ new Set();
    let v, m;
    for (const T of r)
      T.operator === ">" || T.operator === ">=" ? v = l(v, T, p) : T.operator === "<" || T.operator === "<=" ? m = s(m, T, p) : E.add(T.semver);
    if (E.size > 1)
      return null;
    let _;
    if (v && m) {
      if (_ = d(v.semver, m.semver, p), _ > 0)
        return null;
      if (_ === 0 && (v.operator !== ">=" || m.operator !== "<="))
        return null;
    }
    for (const T of E) {
      if (v && !u(T, String(v), p) || m && !u(T, String(m), p))
        return null;
      for (const N of i)
        if (!u(T, String(N), p))
          return !1;
      return !0;
    }
    let R, O, I, b, P = m && !p.includePrerelease && m.semver.prerelease.length ? m.semver : !1, C = v && !p.includePrerelease && v.semver.prerelease.length ? v.semver : !1;
    P && P.prerelease.length === 1 && m.operator === "<" && P.prerelease[0] === 0 && (P = !1);
    for (const T of i) {
      if (b = b || T.operator === ">" || T.operator === ">=", I = I || T.operator === "<" || T.operator === "<=", v) {
        if (C && T.semver.prerelease && T.semver.prerelease.length && T.semver.major === C.major && T.semver.minor === C.minor && T.semver.patch === C.patch && (C = !1), T.operator === ">" || T.operator === ">=") {
          if (R = l(v, T, p), R === T && R !== v)
            return !1;
        } else if (v.operator === ">=" && !u(v.semver, String(T), p))
          return !1;
      }
      if (m) {
        if (P && T.semver.prerelease && T.semver.prerelease.length && T.semver.major === P.major && T.semver.minor === P.minor && T.semver.patch === P.patch && (P = !1), T.operator === "<" || T.operator === "<=") {
          if (O = s(m, T, p), O === T && O !== m)
            return !1;
        } else if (m.operator === "<=" && !u(m.semver, String(T), p))
          return !1;
      }
      if (!T.operator && (m || v) && _ !== 0)
        return !1;
    }
    return !(v && I && !m && _ !== 0 || m && b && !v && _ !== 0 || C || P);
  }, l = (r, i, p) => {
    if (!r)
      return i;
    const E = d(r.semver, i.semver, p);
    return E > 0 ? r : E < 0 || i.operator === ">" && r.operator === ">=" ? i : r;
  }, s = (r, i, p) => {
    if (!r)
      return i;
    const E = d(r.semver, i.semver, p);
    return E < 0 ? r : E > 0 || i.operator === "<" && r.operator === "<=" ? i : r;
  };
  return ao = f, ao;
}
var so, cl;
function ku() {
  if (cl) return so;
  cl = 1;
  const e = Dr(), n = nn(), h = Ye(), u = Lu(), d = Qt(), f = $f(), o = Mf(), c = Bf(), a = jf(), l = Hf(), s = Gf(), r = Wf(), i = Vf(), p = at(), E = Xf(), v = Yf(), m = Co(), _ = zf(), R = Kf(), O = an(), I = Oo(), b = Fu(), P = Uu(), C = No(), T = Po(), N = xu(), w = Jf(), q = sn(), k = st(), M = ln(), U = Zf(), F = ed(), H = td(), L = rd(), G = nd(), X = Do(), ee = id(), he = od(), Z = ad(), ge = sd(), pe = ld();
  return so = {
    parse: d,
    valid: f,
    clean: o,
    inc: c,
    diff: a,
    major: l,
    minor: s,
    patch: r,
    prerelease: i,
    compare: p,
    rcompare: E,
    compareLoose: v,
    compareBuild: m,
    sort: _,
    rsort: R,
    gt: O,
    lt: I,
    eq: b,
    neq: P,
    gte: C,
    lte: T,
    cmp: N,
    coerce: w,
    Comparator: q,
    Range: k,
    satisfies: M,
    toComparators: U,
    maxSatisfying: F,
    minSatisfying: H,
    minVersion: L,
    validRange: G,
    outside: X,
    gtr: ee,
    ltr: he,
    intersects: Z,
    simplifyRange: ge,
    subset: pe,
    SemVer: h,
    re: e.re,
    src: e.src,
    tokens: e.t,
    SEMVER_SPEC_VERSION: n.SEMVER_SPEC_VERSION,
    RELEASE_TYPES: n.RELEASE_TYPES,
    compareIdentifiers: u.compareIdentifiers,
    rcompareIdentifiers: u.rcompareIdentifiers
  }, so;
}
var Wt = {}, Sr = { exports: {} };
Sr.exports;
var fl;
function ud() {
  return fl || (fl = 1, (function(e, n) {
    var h = 200, u = "__lodash_hash_undefined__", d = 1, f = 2, o = 9007199254740991, c = "[object Arguments]", a = "[object Array]", l = "[object AsyncFunction]", s = "[object Boolean]", r = "[object Date]", i = "[object Error]", p = "[object Function]", E = "[object GeneratorFunction]", v = "[object Map]", m = "[object Number]", _ = "[object Null]", R = "[object Object]", O = "[object Promise]", I = "[object Proxy]", b = "[object RegExp]", P = "[object Set]", C = "[object String]", T = "[object Symbol]", N = "[object Undefined]", w = "[object WeakMap]", q = "[object ArrayBuffer]", k = "[object DataView]", M = "[object Float32Array]", U = "[object Float64Array]", F = "[object Int8Array]", H = "[object Int16Array]", L = "[object Int32Array]", G = "[object Uint8Array]", X = "[object Uint8ClampedArray]", ee = "[object Uint16Array]", he = "[object Uint32Array]", Z = /[\\^$.*+?()[\]{}|]/g, ge = /^\[object .+?Constructor\]$/, pe = /^(?:0|[1-9]\d*)$/, Q = {};
    Q[M] = Q[U] = Q[F] = Q[H] = Q[L] = Q[G] = Q[X] = Q[ee] = Q[he] = !0, Q[c] = Q[a] = Q[q] = Q[s] = Q[k] = Q[r] = Q[i] = Q[p] = Q[v] = Q[m] = Q[R] = Q[b] = Q[P] = Q[C] = Q[w] = !1;
    var ce = typeof it == "object" && it && it.Object === Object && it, Ee = typeof self == "object" && self && self.Object === Object && self, Te = ce || Ee || Function("return this")(), Oe = n && !n.nodeType && n, Ce = Oe && !0 && e && !e.nodeType && e, _e = Ce && Ce.exports === Oe, y = _e && ce.process, g = (function() {
      try {
        return y && y.binding && y.binding("util");
      } catch {
      }
    })(), $ = g && g.isTypedArray;
    function D(S, x) {
      for (var J = -1, le = S == null ? 0 : S.length, De = 0, ve = []; ++J < le; ) {
        var Ue = S[J];
        x(Ue, J, S) && (ve[De++] = Ue);
      }
      return ve;
    }
    function ye(S, x) {
      for (var J = -1, le = x.length, De = S.length; ++J < le; )
        S[De + J] = x[J];
      return S;
    }
    function we(S, x) {
      for (var J = -1, le = S == null ? 0 : S.length; ++J < le; )
        if (x(S[J], J, S))
          return !0;
      return !1;
    }
    function Pe(S, x) {
      for (var J = -1, le = Array(S); ++J < S; )
        le[J] = x(J);
      return le;
    }
    function xe(S) {
      return function(x) {
        return S(x);
      };
    }
    function ke(S, x) {
      return S.has(x);
    }
    function He(S, x) {
      return S?.[x];
    }
    function t(S) {
      var x = -1, J = Array(S.size);
      return S.forEach(function(le, De) {
        J[++x] = [De, le];
      }), J;
    }
    function B(S, x) {
      return function(J) {
        return S(x(J));
      };
    }
    function W(S) {
      var x = -1, J = Array(S.size);
      return S.forEach(function(le) {
        J[++x] = le;
      }), J;
    }
    var ie = Array.prototype, V = Function.prototype, ne = Object.prototype, te = Te["__core-js_shared__"], ae = V.toString, ue = ne.hasOwnProperty, Ae = (function() {
      var S = /[^.]+$/.exec(te && te.keys && te.keys.IE_PROTO || "");
      return S ? "Symbol(src)_1." + S : "";
    })(), Re = ne.toString, de = RegExp(
      "^" + ae.call(ue).replace(Z, "\\$&").replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g, "$1.*?") + "$"
    ), A = _e ? Te.Buffer : void 0, j = Te.Symbol, Y = Te.Uint8Array, z = ne.propertyIsEnumerable, K = ie.splice, oe = j ? j.toStringTag : void 0, re = Object.getOwnPropertySymbols, se = A ? A.isBuffer : void 0, fe = B(Object.keys, Object), me = jt(Te, "DataView"), Ne = jt(Te, "Map"), Fe = jt(Te, "Promise"), Se = jt(Te, "Set"), Bt = jt(Te, "WeakMap"), tt = jt(Object, "create"), Tt = bt(me), Ju = bt(Ne), Qu = bt(Fe), Zu = bt(Se), ec = bt(Bt), xo = j ? j.prototype : void 0, cn = xo ? xo.valueOf : void 0;
    function At(S) {
      var x = -1, J = S == null ? 0 : S.length;
      for (this.clear(); ++x < J; ) {
        var le = S[x];
        this.set(le[0], le[1]);
      }
    }
    function tc() {
      this.__data__ = tt ? tt(null) : {}, this.size = 0;
    }
    function rc(S) {
      var x = this.has(S) && delete this.__data__[S];
      return this.size -= x ? 1 : 0, x;
    }
    function nc(S) {
      var x = this.__data__;
      if (tt) {
        var J = x[S];
        return J === u ? void 0 : J;
      }
      return ue.call(x, S) ? x[S] : void 0;
    }
    function ic(S) {
      var x = this.__data__;
      return tt ? x[S] !== void 0 : ue.call(x, S);
    }
    function oc(S, x) {
      var J = this.__data__;
      return this.size += this.has(S) ? 0 : 1, J[S] = tt && x === void 0 ? u : x, this;
    }
    At.prototype.clear = tc, At.prototype.delete = rc, At.prototype.get = nc, At.prototype.has = ic, At.prototype.set = oc;
    function ft(S) {
      var x = -1, J = S == null ? 0 : S.length;
      for (this.clear(); ++x < J; ) {
        var le = S[x];
        this.set(le[0], le[1]);
      }
    }
    function ac() {
      this.__data__ = [], this.size = 0;
    }
    function sc(S) {
      var x = this.__data__, J = Lr(x, S);
      if (J < 0)
        return !1;
      var le = x.length - 1;
      return J == le ? x.pop() : K.call(x, J, 1), --this.size, !0;
    }
    function lc(S) {
      var x = this.__data__, J = Lr(x, S);
      return J < 0 ? void 0 : x[J][1];
    }
    function uc(S) {
      return Lr(this.__data__, S) > -1;
    }
    function cc(S, x) {
      var J = this.__data__, le = Lr(J, S);
      return le < 0 ? (++this.size, J.push([S, x])) : J[le][1] = x, this;
    }
    ft.prototype.clear = ac, ft.prototype.delete = sc, ft.prototype.get = lc, ft.prototype.has = uc, ft.prototype.set = cc;
    function Rt(S) {
      var x = -1, J = S == null ? 0 : S.length;
      for (this.clear(); ++x < J; ) {
        var le = S[x];
        this.set(le[0], le[1]);
      }
    }
    function fc() {
      this.size = 0, this.__data__ = {
        hash: new At(),
        map: new (Ne || ft)(),
        string: new At()
      };
    }
    function dc(S) {
      var x = Fr(this, S).delete(S);
      return this.size -= x ? 1 : 0, x;
    }
    function hc(S) {
      return Fr(this, S).get(S);
    }
    function pc(S) {
      return Fr(this, S).has(S);
    }
    function mc(S, x) {
      var J = Fr(this, S), le = J.size;
      return J.set(S, x), this.size += J.size == le ? 0 : 1, this;
    }
    Rt.prototype.clear = fc, Rt.prototype.delete = dc, Rt.prototype.get = hc, Rt.prototype.has = pc, Rt.prototype.set = mc;
    function Ir(S) {
      var x = -1, J = S == null ? 0 : S.length;
      for (this.__data__ = new Rt(); ++x < J; )
        this.add(S[x]);
    }
    function gc(S) {
      return this.__data__.set(S, u), this;
    }
    function Ec(S) {
      return this.__data__.has(S);
    }
    Ir.prototype.add = Ir.prototype.push = gc, Ir.prototype.has = Ec;
    function pt(S) {
      var x = this.__data__ = new ft(S);
      this.size = x.size;
    }
    function vc() {
      this.__data__ = new ft(), this.size = 0;
    }
    function yc(S) {
      var x = this.__data__, J = x.delete(S);
      return this.size = x.size, J;
    }
    function wc(S) {
      return this.__data__.get(S);
    }
    function _c(S) {
      return this.__data__.has(S);
    }
    function Tc(S, x) {
      var J = this.__data__;
      if (J instanceof ft) {
        var le = J.__data__;
        if (!Ne || le.length < h - 1)
          return le.push([S, x]), this.size = ++J.size, this;
        J = this.__data__ = new Rt(le);
      }
      return J.set(S, x), this.size = J.size, this;
    }
    pt.prototype.clear = vc, pt.prototype.delete = yc, pt.prototype.get = wc, pt.prototype.has = _c, pt.prototype.set = Tc;
    function Ac(S, x) {
      var J = Ur(S), le = !J && qc(S), De = !J && !le && fn(S), ve = !J && !le && !De && Wo(S), Ue = J || le || De || ve, $e = Ue ? Pe(S.length, String) : [], je = $e.length;
      for (var Ie in S)
        ue.call(S, Ie) && !(Ue && // Safari 9 has enumerable `arguments.length` in strict mode.
        (Ie == "length" || // Node.js 0.10 has enumerable non-index properties on buffers.
        De && (Ie == "offset" || Ie == "parent") || // PhantomJS 2 has enumerable non-index properties on typed arrays.
        ve && (Ie == "buffer" || Ie == "byteLength" || Ie == "byteOffset") || // Skip index properties.
        Lc(Ie, je))) && $e.push(Ie);
      return $e;
    }
    function Lr(S, x) {
      for (var J = S.length; J--; )
        if (Bo(S[J][0], x))
          return J;
      return -1;
    }
    function Rc(S, x, J) {
      var le = x(S);
      return Ur(S) ? le : ye(le, J(S));
    }
    function er(S) {
      return S == null ? S === void 0 ? N : _ : oe && oe in Object(S) ? Dc(S) : kc(S);
    }
    function ko(S) {
      return tr(S) && er(S) == c;
    }
    function qo(S, x, J, le, De) {
      return S === x ? !0 : S == null || x == null || !tr(S) && !tr(x) ? S !== S && x !== x : bc(S, x, J, le, qo, De);
    }
    function bc(S, x, J, le, De, ve) {
      var Ue = Ur(S), $e = Ur(x), je = Ue ? a : mt(S), Ie = $e ? a : mt(x);
      je = je == c ? R : je, Ie = Ie == c ? R : Ie;
      var Ke = je == R, rt = Ie == R, Ge = je == Ie;
      if (Ge && fn(S)) {
        if (!fn(x))
          return !1;
        Ue = !0, Ke = !1;
      }
      if (Ge && !Ke)
        return ve || (ve = new pt()), Ue || Wo(S) ? $o(S, x, J, le, De, ve) : Nc(S, x, je, J, le, De, ve);
      if (!(J & d)) {
        var Ze = Ke && ue.call(S, "__wrapped__"), et = rt && ue.call(x, "__wrapped__");
        if (Ze || et) {
          var gt = Ze ? S.value() : S, dt = et ? x.value() : x;
          return ve || (ve = new pt()), De(gt, dt, J, le, ve);
        }
      }
      return Ge ? (ve || (ve = new pt()), Pc(S, x, J, le, De, ve)) : !1;
    }
    function Sc(S) {
      if (!Go(S) || Uc(S))
        return !1;
      var x = jo(S) ? de : ge;
      return x.test(bt(S));
    }
    function Cc(S) {
      return tr(S) && Ho(S.length) && !!Q[er(S)];
    }
    function Oc(S) {
      if (!xc(S))
        return fe(S);
      var x = [];
      for (var J in Object(S))
        ue.call(S, J) && J != "constructor" && x.push(J);
      return x;
    }
    function $o(S, x, J, le, De, ve) {
      var Ue = J & d, $e = S.length, je = x.length;
      if ($e != je && !(Ue && je > $e))
        return !1;
      var Ie = ve.get(S);
      if (Ie && ve.get(x))
        return Ie == x;
      var Ke = -1, rt = !0, Ge = J & f ? new Ir() : void 0;
      for (ve.set(S, x), ve.set(x, S); ++Ke < $e; ) {
        var Ze = S[Ke], et = x[Ke];
        if (le)
          var gt = Ue ? le(et, Ze, Ke, x, S, ve) : le(Ze, et, Ke, S, x, ve);
        if (gt !== void 0) {
          if (gt)
            continue;
          rt = !1;
          break;
        }
        if (Ge) {
          if (!we(x, function(dt, St) {
            if (!ke(Ge, St) && (Ze === dt || De(Ze, dt, J, le, ve)))
              return Ge.push(St);
          })) {
            rt = !1;
            break;
          }
        } else if (!(Ze === et || De(Ze, et, J, le, ve))) {
          rt = !1;
          break;
        }
      }
      return ve.delete(S), ve.delete(x), rt;
    }
    function Nc(S, x, J, le, De, ve, Ue) {
      switch (J) {
        case k:
          if (S.byteLength != x.byteLength || S.byteOffset != x.byteOffset)
            return !1;
          S = S.buffer, x = x.buffer;
        case q:
          return !(S.byteLength != x.byteLength || !ve(new Y(S), new Y(x)));
        case s:
        case r:
        case m:
          return Bo(+S, +x);
        case i:
          return S.name == x.name && S.message == x.message;
        case b:
        case C:
          return S == x + "";
        case v:
          var $e = t;
        case P:
          var je = le & d;
          if ($e || ($e = W), S.size != x.size && !je)
            return !1;
          var Ie = Ue.get(S);
          if (Ie)
            return Ie == x;
          le |= f, Ue.set(S, x);
          var Ke = $o($e(S), $e(x), le, De, ve, Ue);
          return Ue.delete(S), Ke;
        case T:
          if (cn)
            return cn.call(S) == cn.call(x);
      }
      return !1;
    }
    function Pc(S, x, J, le, De, ve) {
      var Ue = J & d, $e = Mo(S), je = $e.length, Ie = Mo(x), Ke = Ie.length;
      if (je != Ke && !Ue)
        return !1;
      for (var rt = je; rt--; ) {
        var Ge = $e[rt];
        if (!(Ue ? Ge in x : ue.call(x, Ge)))
          return !1;
      }
      var Ze = ve.get(S);
      if (Ze && ve.get(x))
        return Ze == x;
      var et = !0;
      ve.set(S, x), ve.set(x, S);
      for (var gt = Ue; ++rt < je; ) {
        Ge = $e[rt];
        var dt = S[Ge], St = x[Ge];
        if (le)
          var Vo = Ue ? le(St, dt, Ge, x, S, ve) : le(dt, St, Ge, S, x, ve);
        if (!(Vo === void 0 ? dt === St || De(dt, St, J, le, ve) : Vo)) {
          et = !1;
          break;
        }
        gt || (gt = Ge == "constructor");
      }
      if (et && !gt) {
        var xr = S.constructor, kr = x.constructor;
        xr != kr && "constructor" in S && "constructor" in x && !(typeof xr == "function" && xr instanceof xr && typeof kr == "function" && kr instanceof kr) && (et = !1);
      }
      return ve.delete(S), ve.delete(x), et;
    }
    function Mo(S) {
      return Rc(S, Bc, Ic);
    }
    function Fr(S, x) {
      var J = S.__data__;
      return Fc(x) ? J[typeof x == "string" ? "string" : "hash"] : J.map;
    }
    function jt(S, x) {
      var J = He(S, x);
      return Sc(J) ? J : void 0;
    }
    function Dc(S) {
      var x = ue.call(S, oe), J = S[oe];
      try {
        S[oe] = void 0;
        var le = !0;
      } catch {
      }
      var De = Re.call(S);
      return le && (x ? S[oe] = J : delete S[oe]), De;
    }
    var Ic = re ? function(S) {
      return S == null ? [] : (S = Object(S), D(re(S), function(x) {
        return z.call(S, x);
      }));
    } : jc, mt = er;
    (me && mt(new me(new ArrayBuffer(1))) != k || Ne && mt(new Ne()) != v || Fe && mt(Fe.resolve()) != O || Se && mt(new Se()) != P || Bt && mt(new Bt()) != w) && (mt = function(S) {
      var x = er(S), J = x == R ? S.constructor : void 0, le = J ? bt(J) : "";
      if (le)
        switch (le) {
          case Tt:
            return k;
          case Ju:
            return v;
          case Qu:
            return O;
          case Zu:
            return P;
          case ec:
            return w;
        }
      return x;
    });
    function Lc(S, x) {
      return x = x ?? o, !!x && (typeof S == "number" || pe.test(S)) && S > -1 && S % 1 == 0 && S < x;
    }
    function Fc(S) {
      var x = typeof S;
      return x == "string" || x == "number" || x == "symbol" || x == "boolean" ? S !== "__proto__" : S === null;
    }
    function Uc(S) {
      return !!Ae && Ae in S;
    }
    function xc(S) {
      var x = S && S.constructor, J = typeof x == "function" && x.prototype || ne;
      return S === J;
    }
    function kc(S) {
      return Re.call(S);
    }
    function bt(S) {
      if (S != null) {
        try {
          return ae.call(S);
        } catch {
        }
        try {
          return S + "";
        } catch {
        }
      }
      return "";
    }
    function Bo(S, x) {
      return S === x || S !== S && x !== x;
    }
    var qc = ko(/* @__PURE__ */ (function() {
      return arguments;
    })()) ? ko : function(S) {
      return tr(S) && ue.call(S, "callee") && !z.call(S, "callee");
    }, Ur = Array.isArray;
    function $c(S) {
      return S != null && Ho(S.length) && !jo(S);
    }
    var fn = se || Hc;
    function Mc(S, x) {
      return qo(S, x);
    }
    function jo(S) {
      if (!Go(S))
        return !1;
      var x = er(S);
      return x == p || x == E || x == l || x == I;
    }
    function Ho(S) {
      return typeof S == "number" && S > -1 && S % 1 == 0 && S <= o;
    }
    function Go(S) {
      var x = typeof S;
      return S != null && (x == "object" || x == "function");
    }
    function tr(S) {
      return S != null && typeof S == "object";
    }
    var Wo = $ ? xe($) : Cc;
    function Bc(S) {
      return $c(S) ? Ac(S) : Oc(S);
    }
    function jc() {
      return [];
    }
    function Hc() {
      return !1;
    }
    e.exports = Mc;
  })(Sr, Sr.exports)), Sr.exports;
}
var dl;
function cd() {
  if (dl) return Wt;
  dl = 1, Object.defineProperty(Wt, "__esModule", { value: !0 }), Wt.DownloadedUpdateHelper = void 0, Wt.createTempUpdateFile = c;
  const e = Or, n = yt, h = ud(), u = /* @__PURE__ */ _t(), d = Le;
  let f = class {
    constructor(l) {
      this.cacheDir = l, this._file = null, this._packageFile = null, this.versionInfo = null, this.fileInfo = null, this._downloadedFileInfo = null;
    }
    get downloadedFileInfo() {
      return this._downloadedFileInfo;
    }
    get file() {
      return this._file;
    }
    get packageFile() {
      return this._packageFile;
    }
    get cacheDirForPendingUpdate() {
      return d.join(this.cacheDir, "pending");
    }
    async validateDownloadedPath(l, s, r, i) {
      if (this.versionInfo != null && this.file === l && this.fileInfo != null)
        return h(this.versionInfo, s) && h(this.fileInfo.info, r.info) && await (0, u.pathExists)(l) ? l : null;
      const p = await this.getValidCachedUpdateFile(r, i);
      return p === null ? null : (i.info(`Update has already been downloaded to ${l}).`), this._file = p, p);
    }
    async setDownloadedFile(l, s, r, i, p, E) {
      this._file = l, this._packageFile = s, this.versionInfo = r, this.fileInfo = i, this._downloadedFileInfo = {
        fileName: p,
        sha512: i.info.sha512,
        isAdminRightsRequired: i.info.isAdminRightsRequired === !0
      }, E && await (0, u.outputJson)(this.getUpdateInfoFile(), this._downloadedFileInfo);
    }
    async clear() {
      this._file = null, this._packageFile = null, this.versionInfo = null, this.fileInfo = null, await this.cleanCacheDirForPendingUpdate();
    }
    async cleanCacheDirForPendingUpdate() {
      try {
        await (0, u.emptyDir)(this.cacheDirForPendingUpdate);
      } catch {
      }
    }
    /**
     * Returns "update-info.json" which is created in the update cache directory's "pending" subfolder after the first update is downloaded.  If the update file does not exist then the cache is cleared and recreated.  If the update file exists then its properties are validated.
     * @param fileInfo
     * @param logger
     */
    async getValidCachedUpdateFile(l, s) {
      const r = this.getUpdateInfoFile();
      if (!await (0, u.pathExists)(r))
        return null;
      let p;
      try {
        p = await (0, u.readJson)(r);
      } catch (_) {
        let R = "No cached update info available";
        return _.code !== "ENOENT" && (await this.cleanCacheDirForPendingUpdate(), R += ` (error on read: ${_.message})`), s.info(R), null;
      }
      if (!(p?.fileName !== null))
        return s.warn("Cached update info is corrupted: no fileName, directory for cached update will be cleaned"), await this.cleanCacheDirForPendingUpdate(), null;
      if (l.info.sha512 !== p.sha512)
        return s.info(`Cached update sha512 checksum doesn't match the latest available update. New update must be downloaded. Cached: ${p.sha512}, expected: ${l.info.sha512}. Directory for cached update will be cleaned`), await this.cleanCacheDirForPendingUpdate(), null;
      const v = d.join(this.cacheDirForPendingUpdate, p.fileName);
      if (!await (0, u.pathExists)(v))
        return s.info("Cached update file doesn't exist"), null;
      const m = await o(v);
      return l.info.sha512 !== m ? (s.warn(`Sha512 checksum doesn't match the latest available update. New update must be downloaded. Cached: ${m}, expected: ${l.info.sha512}`), await this.cleanCacheDirForPendingUpdate(), null) : (this._downloadedFileInfo = p, v);
    }
    getUpdateInfoFile() {
      return d.join(this.cacheDirForPendingUpdate, "update-info.json");
    }
  };
  Wt.DownloadedUpdateHelper = f;
  function o(a, l = "sha512", s = "base64", r) {
    return new Promise((i, p) => {
      const E = (0, e.createHash)(l);
      E.on("error", p).setEncoding(s), (0, n.createReadStream)(a, {
        ...r,
        highWaterMark: 1024 * 1024
        /* better to use more memory but hash faster */
      }).on("error", p).on("end", () => {
        E.end(), i(E.read());
      }).pipe(E, { end: !1 });
    });
  }
  async function c(a, l, s) {
    let r = 0, i = d.join(l, a);
    for (let p = 0; p < 3; p++)
      try {
        return await (0, u.unlink)(i), i;
      } catch (E) {
        if (E.code === "ENOENT")
          return i;
        s.warn(`Error on remove temp update file: ${E}`), i = d.join(l, `${r++}-${a}`);
      }
    return i;
  }
  return Wt;
}
var ar = {}, zr = {}, hl;
function fd() {
  if (hl) return zr;
  hl = 1, Object.defineProperty(zr, "__esModule", { value: !0 }), zr.getAppCacheDir = h;
  const e = Le, n = en;
  function h() {
    const u = (0, n.homedir)();
    let d;
    return process.platform === "win32" ? d = process.env.LOCALAPPDATA || e.join(u, "AppData", "Local") : process.platform === "darwin" ? d = e.join(u, "Library", "Caches") : d = process.env.XDG_CACHE_HOME || e.join(u, ".cache"), d;
  }
  return zr;
}
var pl;
function dd() {
  if (pl) return ar;
  pl = 1, Object.defineProperty(ar, "__esModule", { value: !0 }), ar.ElectronAppAdapter = void 0;
  const e = Le, n = fd();
  let h = class {
    constructor(d = kt.app) {
      this.app = d;
    }
    whenReady() {
      return this.app.whenReady();
    }
    get version() {
      return this.app.getVersion();
    }
    get name() {
      return this.app.getName();
    }
    get isPackaged() {
      return this.app.isPackaged === !0;
    }
    get appUpdateConfigPath() {
      return this.isPackaged ? e.join(process.resourcesPath, "app-update.yml") : e.join(this.app.getAppPath(), "dev-app-update.yml");
    }
    get userDataPath() {
      return this.app.getPath("userData");
    }
    get baseCachePath() {
      return (0, n.getAppCacheDir)();
    }
    quit() {
      this.app.quit();
    }
    relaunch() {
      this.app.relaunch();
    }
    onQuit(d) {
      this.app.once("quit", (f, o) => d(o));
    }
  };
  return ar.ElectronAppAdapter = h, ar;
}
var lo = {}, ml;
function hd() {
  return ml || (ml = 1, (function(e) {
    Object.defineProperty(e, "__esModule", { value: !0 }), e.ElectronHttpExecutor = e.NET_SESSION_NAME = void 0, e.getNetSession = h;
    const n = Be();
    e.NET_SESSION_NAME = "electron-updater";
    function h() {
      return kt.session.fromPartition(e.NET_SESSION_NAME, {
        cache: !1
      });
    }
    class u extends n.HttpExecutor {
      constructor(f) {
        super(), this.proxyLoginCallback = f, this.cachedSession = null;
      }
      async download(f, o, c) {
        return await c.cancellationToken.createPromise((a, l, s) => {
          const r = {
            headers: c.headers || void 0,
            redirect: "manual"
          };
          (0, n.configureRequestUrl)(f, r), (0, n.configureRequestOptions)(r), this.doDownload(r, {
            destination: o,
            options: c,
            onCancel: s,
            callback: (i) => {
              i == null ? a(o) : l(i);
            },
            responseHandler: null
          }, 0);
        });
      }
      createRequest(f, o) {
        f.headers && f.headers.Host && (f.host = f.headers.Host, delete f.headers.Host), this.cachedSession == null && (this.cachedSession = h());
        const c = kt.net.request({
          ...f,
          session: this.cachedSession
        });
        return c.on("response", o), this.proxyLoginCallback != null && c.on("login", this.proxyLoginCallback), c;
      }
      addRedirectHandlers(f, o, c, a, l) {
        f.on("redirect", (s, r, i) => {
          f.abort(), a > this.maxRedirects ? c(this.createMaxRedirectError()) : l(n.HttpExecutor.prepareRedirectUrlOptions(i, o));
        });
      }
    }
    e.ElectronHttpExecutor = u;
  })(lo)), lo;
}
var sr = {}, Vt = {}, gl;
function $t() {
  if (gl) return Vt;
  gl = 1, Object.defineProperty(Vt, "__esModule", { value: !0 }), Vt.newBaseUrl = n, Vt.newUrlFromBase = h, Vt.getChannelFilename = u;
  const e = wt;
  function n(d) {
    const f = new e.URL(d);
    return f.pathname.endsWith("/") || (f.pathname += "/"), f;
  }
  function h(d, f, o = !1) {
    const c = new e.URL(d, f), a = f.search;
    return a != null && a.length !== 0 ? c.search = a : o && (c.search = `noCache=${Date.now().toString(32)}`), c;
  }
  function u(d) {
    return `${d}.yml`;
  }
  return Vt;
}
var ht = {}, uo, El;
function qu() {
  if (El) return uo;
  El = 1;
  var e = "[object Symbol]", n = /[\\^$.*+?()[\]{}|]/g, h = RegExp(n.source), u = typeof it == "object" && it && it.Object === Object && it, d = typeof self == "object" && self && self.Object === Object && self, f = u || d || Function("return this")(), o = Object.prototype, c = o.toString, a = f.Symbol, l = a ? a.prototype : void 0, s = l ? l.toString : void 0;
  function r(m) {
    if (typeof m == "string")
      return m;
    if (p(m))
      return s ? s.call(m) : "";
    var _ = m + "";
    return _ == "0" && 1 / m == -1 / 0 ? "-0" : _;
  }
  function i(m) {
    return !!m && typeof m == "object";
  }
  function p(m) {
    return typeof m == "symbol" || i(m) && c.call(m) == e;
  }
  function E(m) {
    return m == null ? "" : r(m);
  }
  function v(m) {
    return m = E(m), m && h.test(m) ? m.replace(n, "\\$&") : m;
  }
  return uo = v, uo;
}
var vl;
function Qe() {
  if (vl) return ht;
  vl = 1, Object.defineProperty(ht, "__esModule", { value: !0 }), ht.Provider = void 0, ht.findFile = o, ht.parseUpdateInfo = c, ht.getFileList = a, ht.resolveFiles = l;
  const e = Be(), n = bo(), h = wt, u = $t(), d = qu();
  let f = class {
    constructor(r) {
      this.runtimeOptions = r, this.requestHeaders = null, this.executor = r.executor;
    }
    // By default, the blockmap file is in the same directory as the main file
    // But some providers may have a different blockmap file, so we need to override this method
    getBlockMapFiles(r, i, p, E = null) {
      const v = (0, u.newUrlFromBase)(`${r.pathname}.blockmap`, r);
      return [(0, u.newUrlFromBase)(`${r.pathname.replace(new RegExp(d(p), "g"), i)}.blockmap`, E ? new h.URL(E) : r), v];
    }
    get isUseMultipleRangeRequest() {
      return this.runtimeOptions.isUseMultipleRangeRequest !== !1;
    }
    getChannelFilePrefix() {
      if (this.runtimeOptions.platform === "linux") {
        const r = process.env.TEST_UPDATER_ARCH || process.arch;
        return "-linux" + (r === "x64" ? "" : `-${r}`);
      } else
        return this.runtimeOptions.platform === "darwin" ? "-mac" : "";
    }
    // due to historical reasons for windows we use channel name without platform specifier
    getDefaultChannelName() {
      return this.getCustomChannelName("latest");
    }
    getCustomChannelName(r) {
      return `${r}${this.getChannelFilePrefix()}`;
    }
    get fileExtraDownloadHeaders() {
      return null;
    }
    setRequestHeaders(r) {
      this.requestHeaders = r;
    }
    /**
     * Method to perform API request only to resolve update info, but not to download update.
     */
    httpRequest(r, i, p) {
      return this.executor.request(this.createRequestOptions(r, i), p);
    }
    createRequestOptions(r, i) {
      const p = {};
      return this.requestHeaders == null ? i != null && (p.headers = i) : p.headers = i == null ? this.requestHeaders : { ...this.requestHeaders, ...i }, (0, e.configureRequestUrl)(r, p), p;
    }
  };
  ht.Provider = f;
  function o(s, r, i) {
    var p;
    if (s.length === 0)
      throw (0, e.newError)("No files provided", "ERR_UPDATER_NO_FILES_PROVIDED");
    const E = s.filter((m) => m.url.pathname.toLowerCase().endsWith(`.${r.toLowerCase()}`)), v = (p = E.find((m) => [m.url.pathname, m.info.url].some((_) => _.includes(process.arch)))) !== null && p !== void 0 ? p : E.shift();
    return v || (i == null ? s[0] : s.find((m) => !i.some((_) => m.url.pathname.toLowerCase().endsWith(`.${_.toLowerCase()}`))));
  }
  function c(s, r, i) {
    if (s == null)
      throw (0, e.newError)(`Cannot parse update info from ${r} in the latest release artifacts (${i}): rawData: null`, "ERR_UPDATER_INVALID_UPDATE_INFO");
    let p;
    try {
      p = (0, n.load)(s);
    } catch (E) {
      throw (0, e.newError)(`Cannot parse update info from ${r} in the latest release artifacts (${i}): ${E.stack || E.message}, rawData: ${s}`, "ERR_UPDATER_INVALID_UPDATE_INFO");
    }
    return p;
  }
  function a(s) {
    const r = s.files;
    if (r != null && r.length > 0)
      return r;
    if (s.path != null)
      return [
        {
          url: s.path,
          sha2: s.sha2,
          sha512: s.sha512
        }
      ];
    throw (0, e.newError)(`No files provided: ${(0, e.safeStringifyJson)(s)}`, "ERR_UPDATER_NO_FILES_PROVIDED");
  }
  function l(s, r, i = (p) => p) {
    const E = a(s).map((_) => {
      if (_.sha2 == null && _.sha512 == null)
        throw (0, e.newError)(`Update info doesn't contain nor sha256 neither sha512 checksum: ${(0, e.safeStringifyJson)(_)}`, "ERR_UPDATER_NO_CHECKSUM");
      return {
        url: (0, u.newUrlFromBase)(i(_.url), r),
        info: _
      };
    }), v = s.packages, m = v == null ? null : v[process.arch] || v.ia32;
    return m != null && (E[0].packageInfo = {
      ...m,
      path: (0, u.newUrlFromBase)(i(m.path), r).href
    }), E;
  }
  return ht;
}
var yl;
function $u() {
  if (yl) return sr;
  yl = 1, Object.defineProperty(sr, "__esModule", { value: !0 }), sr.GenericProvider = void 0;
  const e = Be(), n = $t(), h = Qe();
  let u = class extends h.Provider {
    constructor(f, o, c) {
      super(c), this.configuration = f, this.updater = o, this.baseUrl = (0, n.newBaseUrl)(this.configuration.url);
    }
    get channel() {
      const f = this.updater.channel || this.configuration.channel;
      return f == null ? this.getDefaultChannelName() : this.getCustomChannelName(f);
    }
    async getLatestVersion() {
      const f = (0, n.getChannelFilename)(this.channel), o = (0, n.newUrlFromBase)(f, this.baseUrl, this.updater.isAddNoCacheQuery);
      for (let c = 0; ; c++)
        try {
          return (0, h.parseUpdateInfo)(await this.httpRequest(o), f, o);
        } catch (a) {
          if (a instanceof e.HttpError && a.statusCode === 404)
            throw (0, e.newError)(`Cannot find channel "${f}" update info: ${a.stack || a.message}`, "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND");
          if (a.code === "ECONNREFUSED" && c < 3) {
            await new Promise((l, s) => {
              try {
                setTimeout(l, 1e3 * c);
              } catch (r) {
                s(r);
              }
            });
            continue;
          }
          throw a;
        }
    }
    resolveFiles(f) {
      return (0, h.resolveFiles)(f, this.baseUrl);
    }
  };
  return sr.GenericProvider = u, sr;
}
var lr = {}, ur = {}, wl;
function pd() {
  if (wl) return ur;
  wl = 1, Object.defineProperty(ur, "__esModule", { value: !0 }), ur.BitbucketProvider = void 0;
  const e = Be(), n = $t(), h = Qe();
  let u = class extends h.Provider {
    constructor(f, o, c) {
      super({
        ...c,
        isUseMultipleRangeRequest: !1
      }), this.configuration = f, this.updater = o;
      const { owner: a, slug: l } = f;
      this.baseUrl = (0, n.newBaseUrl)(`https://api.bitbucket.org/2.0/repositories/${a}/${l}/downloads`);
    }
    get channel() {
      return this.updater.channel || this.configuration.channel || "latest";
    }
    async getLatestVersion() {
      const f = new e.CancellationToken(), o = (0, n.getChannelFilename)(this.getCustomChannelName(this.channel)), c = (0, n.newUrlFromBase)(o, this.baseUrl, this.updater.isAddNoCacheQuery);
      try {
        const a = await this.httpRequest(c, void 0, f);
        return (0, h.parseUpdateInfo)(a, o, c);
      } catch (a) {
        throw (0, e.newError)(`Unable to find latest version on ${this.toString()}, please ensure release exists: ${a.stack || a.message}`, "ERR_UPDATER_LATEST_VERSION_NOT_FOUND");
      }
    }
    resolveFiles(f) {
      return (0, h.resolveFiles)(f, this.baseUrl);
    }
    toString() {
      const { owner: f, slug: o } = this.configuration;
      return `Bitbucket (owner: ${f}, slug: ${o}, channel: ${this.channel})`;
    }
  };
  return ur.BitbucketProvider = u, ur;
}
var vt = {}, _l;
function Mu() {
  if (_l) return vt;
  _l = 1, Object.defineProperty(vt, "__esModule", { value: !0 }), vt.GitHubProvider = vt.BaseGitHubProvider = void 0, vt.computeReleaseNotes = l;
  const e = Be(), n = ku(), h = wt, u = $t(), d = Qe(), f = /\/tag\/([^/]+)$/;
  class o extends d.Provider {
    constructor(r, i, p) {
      super({
        ...p,
        /* because GitHib uses S3 */
        isUseMultipleRangeRequest: !1
      }), this.options = r, this.baseUrl = (0, u.newBaseUrl)((0, e.githubUrl)(r, i));
      const E = i === "github.com" ? "api.github.com" : i;
      this.baseApiUrl = (0, u.newBaseUrl)((0, e.githubUrl)(r, E));
    }
    computeGithubBasePath(r) {
      const i = this.options.host;
      return i && !["github.com", "api.github.com"].includes(i) ? `/api/v3${r}` : r;
    }
  }
  vt.BaseGitHubProvider = o;
  let c = class extends o {
    constructor(r, i, p) {
      super(r, "github.com", p), this.options = r, this.updater = i;
    }
    get channel() {
      const r = this.updater.channel || this.options.channel;
      return r == null ? this.getDefaultChannelName() : this.getCustomChannelName(r);
    }
    async getLatestVersion() {
      var r, i, p, E, v;
      const m = new e.CancellationToken(), _ = await this.httpRequest((0, u.newUrlFromBase)(`${this.basePath}.atom`, this.baseUrl), {
        accept: "application/xml, application/atom+xml, text/xml, */*"
      }, m), R = (0, e.parseXml)(_);
      let O = R.element("entry", !1, "No published versions on GitHub"), I = null;
      try {
        if (this.updater.allowPrerelease) {
          const w = ((r = this.updater) === null || r === void 0 ? void 0 : r.channel) || ((i = n.prerelease(this.updater.currentVersion)) === null || i === void 0 ? void 0 : i[0]) || null;
          if (w === null)
            I = f.exec(O.element("link").attribute("href"))[1];
          else
            for (const q of R.getElements("entry")) {
              const k = f.exec(q.element("link").attribute("href"));
              if (k === null)
                continue;
              const M = k[1], U = ((p = n.prerelease(M)) === null || p === void 0 ? void 0 : p[0]) || null, F = !w || ["alpha", "beta"].includes(w), H = U !== null && !["alpha", "beta"].includes(String(U));
              if (F && !H && !(w === "beta" && U === "alpha")) {
                I = M;
                break;
              }
              if (U && U === w) {
                I = M;
                break;
              }
            }
        } else {
          I = await this.getLatestTagName(m);
          for (const w of R.getElements("entry"))
            if (f.exec(w.element("link").attribute("href"))[1] === I) {
              O = w;
              break;
            }
        }
      } catch (w) {
        throw (0, e.newError)(`Cannot parse releases feed: ${w.stack || w.message},
XML:
${_}`, "ERR_UPDATER_INVALID_RELEASE_FEED");
      }
      if (I == null)
        throw (0, e.newError)("No published versions on GitHub", "ERR_UPDATER_NO_PUBLISHED_VERSIONS");
      let b, P = "", C = "";
      const T = async (w) => {
        P = (0, u.getChannelFilename)(w), C = (0, u.newUrlFromBase)(this.getBaseDownloadPath(String(I), P), this.baseUrl);
        const q = this.createRequestOptions(C);
        try {
          return await this.executor.request(q, m);
        } catch (k) {
          throw k instanceof e.HttpError && k.statusCode === 404 ? (0, e.newError)(`Cannot find ${P} in the latest release artifacts (${C}): ${k.stack || k.message}`, "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND") : k;
        }
      };
      try {
        let w = this.channel;
        this.updater.allowPrerelease && (!((E = n.prerelease(I)) === null || E === void 0) && E[0]) && (w = this.getCustomChannelName(String((v = n.prerelease(I)) === null || v === void 0 ? void 0 : v[0]))), b = await T(w);
      } catch (w) {
        if (this.updater.allowPrerelease)
          b = await T(this.getDefaultChannelName());
        else
          throw w;
      }
      const N = (0, d.parseUpdateInfo)(b, P, C);
      return N.releaseName == null && (N.releaseName = O.elementValueOrEmpty("title")), N.releaseNotes == null && (N.releaseNotes = l(this.updater.currentVersion, this.updater.fullChangelog, R, O)), {
        tag: I,
        ...N
      };
    }
    async getLatestTagName(r) {
      const i = this.options, p = i.host == null || i.host === "github.com" ? (0, u.newUrlFromBase)(`${this.basePath}/latest`, this.baseUrl) : new h.URL(`${this.computeGithubBasePath(`/repos/${i.owner}/${i.repo}/releases`)}/latest`, this.baseApiUrl);
      try {
        const E = await this.httpRequest(p, { Accept: "application/json" }, r);
        return E == null ? null : JSON.parse(E).tag_name;
      } catch (E) {
        throw (0, e.newError)(`Unable to find latest version on GitHub (${p}), please ensure a production release exists: ${E.stack || E.message}`, "ERR_UPDATER_LATEST_VERSION_NOT_FOUND");
      }
    }
    get basePath() {
      return `/${this.options.owner}/${this.options.repo}/releases`;
    }
    resolveFiles(r) {
      return (0, d.resolveFiles)(r, this.baseUrl, (i) => this.getBaseDownloadPath(r.tag, i.replace(/ /g, "-")));
    }
    getBaseDownloadPath(r, i) {
      return `${this.basePath}/download/${r}/${i}`;
    }
  };
  vt.GitHubProvider = c;
  function a(s) {
    const r = s.elementValueOrEmpty("content");
    return r === "No content." ? "" : r;
  }
  function l(s, r, i, p) {
    if (!r)
      return a(p);
    const E = [];
    for (const v of i.getElements("entry")) {
      const m = /\/tag\/v?([^/]+)$/.exec(v.element("link").attribute("href"))[1];
      n.valid(m) && n.lt(s, m) && E.push({
        version: m,
        note: a(v)
      });
    }
    return E.sort((v, m) => n.rcompare(v.version, m.version));
  }
  return vt;
}
var cr = {}, Tl;
function md() {
  if (Tl) return cr;
  Tl = 1, Object.defineProperty(cr, "__esModule", { value: !0 }), cr.GitLabProvider = void 0;
  const e = Be(), n = wt, h = qu(), u = $t(), d = Qe();
  let f = class extends d.Provider {
    /**
     * Normalizes filenames by replacing spaces and underscores with dashes.
     *
     * This is a workaround to handle filename formatting differences between tools:
     * - electron-builder formats filenames like "test file.txt" as "test-file.txt"
     * - GitLab may provide asset URLs using underscores, such as "test_file.txt"
     *
     * Because of this mismatch, we can't reliably extract the correct filename from
     * the asset path without normalization. This function ensures consistent matching
     * across different filename formats by converting all spaces and underscores to dashes.
     *
     * @param filename The filename to normalize
     * @returns The normalized filename with spaces and underscores replaced by dashes
     */
    normalizeFilename(c) {
      return c.replace(/ |_/g, "-");
    }
    constructor(c, a, l) {
      super({
        ...l,
        // GitLab might not support multiple range requests efficiently
        isUseMultipleRangeRequest: !1
      }), this.options = c, this.updater = a, this.cachedLatestVersion = null;
      const r = c.host || "gitlab.com";
      this.baseApiUrl = (0, u.newBaseUrl)(`https://${r}/api/v4`);
    }
    get channel() {
      const c = this.updater.channel || this.options.channel;
      return c == null ? this.getDefaultChannelName() : this.getCustomChannelName(c);
    }
    async getLatestVersion() {
      const c = new e.CancellationToken(), a = (0, u.newUrlFromBase)(`projects/${this.options.projectId}/releases/permalink/latest`, this.baseApiUrl);
      let l;
      try {
        const R = { "Content-Type": "application/json", ...this.setAuthHeaderForToken(this.options.token || null) }, O = await this.httpRequest(a, R, c);
        if (!O)
          throw (0, e.newError)("No latest release found", "ERR_UPDATER_NO_PUBLISHED_VERSIONS");
        l = JSON.parse(O);
      } catch (R) {
        throw (0, e.newError)(`Unable to find latest release on GitLab (${a}): ${R.stack || R.message}`, "ERR_UPDATER_LATEST_VERSION_NOT_FOUND");
      }
      const s = l.tag_name;
      let r = null, i = "", p = null;
      const E = async (R) => {
        i = (0, u.getChannelFilename)(R);
        const O = l.assets.links.find((b) => b.name === i);
        if (!O)
          throw (0, e.newError)(`Cannot find ${i} in the latest release assets`, "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND");
        p = new n.URL(O.direct_asset_url);
        const I = this.options.token ? { "PRIVATE-TOKEN": this.options.token } : void 0;
        try {
          const b = await this.httpRequest(p, I, c);
          if (!b)
            throw (0, e.newError)(`Empty response from ${p}`, "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND");
          return b;
        } catch (b) {
          throw b instanceof e.HttpError && b.statusCode === 404 ? (0, e.newError)(`Cannot find ${i} in the latest release artifacts (${p}): ${b.stack || b.message}`, "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND") : b;
        }
      };
      try {
        r = await E(this.channel);
      } catch (R) {
        if (this.channel !== this.getDefaultChannelName())
          r = await E(this.getDefaultChannelName());
        else
          throw R;
      }
      if (!r)
        throw (0, e.newError)(`Unable to parse channel data from ${i}`, "ERR_UPDATER_INVALID_UPDATE_INFO");
      const v = (0, d.parseUpdateInfo)(r, i, p);
      v.releaseName == null && (v.releaseName = l.name), v.releaseNotes == null && (v.releaseNotes = l.description || null);
      const m = /* @__PURE__ */ new Map();
      for (const R of l.assets.links)
        m.set(this.normalizeFilename(R.name), R.direct_asset_url);
      const _ = {
        tag: s,
        assets: m,
        ...v
      };
      return this.cachedLatestVersion = _, _;
    }
    /**
     * Utility function to convert GitlabReleaseAsset to Map<string, string>
     * Maps asset names to their download URLs
     */
    convertAssetsToMap(c) {
      const a = /* @__PURE__ */ new Map();
      for (const l of c.links)
        a.set(this.normalizeFilename(l.name), l.direct_asset_url);
      return a;
    }
    /**
     * Find blockmap file URL in assets map for a specific filename
     */
    findBlockMapInAssets(c, a) {
      const l = [`${a}.blockmap`, `${this.normalizeFilename(a)}.blockmap`];
      for (const s of l) {
        const r = c.get(s);
        if (r)
          return new n.URL(r);
      }
      return null;
    }
    async fetchReleaseInfoByVersion(c) {
      const a = new e.CancellationToken(), l = [`v${c}`, c];
      for (const s of l) {
        const r = (0, u.newUrlFromBase)(`projects/${this.options.projectId}/releases/${encodeURIComponent(s)}`, this.baseApiUrl);
        try {
          const i = { "Content-Type": "application/json", ...this.setAuthHeaderForToken(this.options.token || null) }, p = await this.httpRequest(r, i, a);
          if (p)
            return JSON.parse(p);
        } catch (i) {
          if (i instanceof e.HttpError && i.statusCode === 404)
            continue;
          throw (0, e.newError)(`Unable to find release ${s} on GitLab (${r}): ${i.stack || i.message}`, "ERR_UPDATER_RELEASE_NOT_FOUND");
        }
      }
      throw (0, e.newError)(`Unable to find release with version ${c} (tried: ${l.join(", ")}) on GitLab`, "ERR_UPDATER_RELEASE_NOT_FOUND");
    }
    setAuthHeaderForToken(c) {
      const a = {};
      return c != null && (c.startsWith("Bearer") ? a.authorization = c : a["PRIVATE-TOKEN"] = c), a;
    }
    /**
     * Get version info for blockmap files, using cache when possible
     */
    async getVersionInfoForBlockMap(c) {
      if (this.cachedLatestVersion && this.cachedLatestVersion.version === c)
        return this.cachedLatestVersion.assets;
      const a = await this.fetchReleaseInfoByVersion(c);
      return a && a.assets ? this.convertAssetsToMap(a.assets) : null;
    }
    /**
     * Find blockmap URLs from version assets
     */
    async findBlockMapUrlsFromAssets(c, a, l) {
      let s = null, r = null;
      const i = await this.getVersionInfoForBlockMap(a);
      i && (s = this.findBlockMapInAssets(i, l));
      const p = await this.getVersionInfoForBlockMap(c);
      if (p) {
        const E = l.replace(new RegExp(h(a), "g"), c);
        r = this.findBlockMapInAssets(p, E);
      }
      return [r, s];
    }
    async getBlockMapFiles(c, a, l, s = null) {
      if (this.options.uploadTarget === "project_upload") {
        const r = c.pathname.split("/").pop() || "", [i, p] = await this.findBlockMapUrlsFromAssets(a, l, r);
        if (!p)
          throw (0, e.newError)(`Cannot find blockmap file for ${l} in GitLab assets`, "ERR_UPDATER_BLOCKMAP_FILE_NOT_FOUND");
        if (!i)
          throw (0, e.newError)(`Cannot find blockmap file for ${a} in GitLab assets`, "ERR_UPDATER_BLOCKMAP_FILE_NOT_FOUND");
        return [i, p];
      } else
        return super.getBlockMapFiles(c, a, l, s);
    }
    resolveFiles(c) {
      return (0, d.getFileList)(c).map((a) => {
        const s = [
          a.url,
          // Original filename
          this.normalizeFilename(a.url)
          // Normalized filename (spaces/underscores → dashes)
        ].find((i) => c.assets.has(i)), r = s ? c.assets.get(s) : void 0;
        if (!r)
          throw (0, e.newError)(`Cannot find asset "${a.url}" in GitLab release assets. Available assets: ${Array.from(c.assets.keys()).join(", ")}`, "ERR_UPDATER_ASSET_NOT_FOUND");
        return {
          url: new n.URL(r),
          info: a
        };
      });
    }
    toString() {
      return `GitLab (projectId: ${this.options.projectId}, channel: ${this.channel})`;
    }
  };
  return cr.GitLabProvider = f, cr;
}
var fr = {}, Al;
function gd() {
  if (Al) return fr;
  Al = 1, Object.defineProperty(fr, "__esModule", { value: !0 }), fr.KeygenProvider = void 0;
  const e = Be(), n = $t(), h = Qe();
  let u = class extends h.Provider {
    constructor(f, o, c) {
      super({
        ...c,
        isUseMultipleRangeRequest: !1
      }), this.configuration = f, this.updater = o, this.defaultHostname = "api.keygen.sh";
      const a = this.configuration.host || this.defaultHostname;
      this.baseUrl = (0, n.newBaseUrl)(`https://${a}/v1/accounts/${this.configuration.account}/artifacts?product=${this.configuration.product}`);
    }
    get channel() {
      return this.updater.channel || this.configuration.channel || "stable";
    }
    async getLatestVersion() {
      const f = new e.CancellationToken(), o = (0, n.getChannelFilename)(this.getCustomChannelName(this.channel)), c = (0, n.newUrlFromBase)(o, this.baseUrl, this.updater.isAddNoCacheQuery);
      try {
        const a = await this.httpRequest(c, {
          Accept: "application/vnd.api+json",
          "Keygen-Version": "1.1"
        }, f);
        return (0, h.parseUpdateInfo)(a, o, c);
      } catch (a) {
        throw (0, e.newError)(`Unable to find latest version on ${this.toString()}, please ensure release exists: ${a.stack || a.message}`, "ERR_UPDATER_LATEST_VERSION_NOT_FOUND");
      }
    }
    resolveFiles(f) {
      return (0, h.resolveFiles)(f, this.baseUrl);
    }
    toString() {
      const { account: f, product: o, platform: c } = this.configuration;
      return `Keygen (account: ${f}, product: ${o}, platform: ${c}, channel: ${this.channel})`;
    }
  };
  return fr.KeygenProvider = u, fr;
}
var dr = {}, Rl;
function Ed() {
  if (Rl) return dr;
  Rl = 1, Object.defineProperty(dr, "__esModule", { value: !0 }), dr.PrivateGitHubProvider = void 0;
  const e = Be(), n = bo(), h = Le, u = wt, d = $t(), f = Mu(), o = Qe();
  let c = class extends f.BaseGitHubProvider {
    constructor(l, s, r, i) {
      super(l, "api.github.com", i), this.updater = s, this.token = r;
    }
    createRequestOptions(l, s) {
      const r = super.createRequestOptions(l, s);
      return r.redirect = "manual", r;
    }
    async getLatestVersion() {
      const l = new e.CancellationToken(), s = (0, d.getChannelFilename)(this.getDefaultChannelName()), r = await this.getLatestVersionInfo(l), i = r.assets.find((v) => v.name === s);
      if (i == null)
        throw (0, e.newError)(`Cannot find ${s} in the release ${r.html_url || r.name}`, "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND");
      const p = new u.URL(i.url);
      let E;
      try {
        E = (0, n.load)(await this.httpRequest(p, this.configureHeaders("application/octet-stream"), l));
      } catch (v) {
        throw v instanceof e.HttpError && v.statusCode === 404 ? (0, e.newError)(`Cannot find ${s} in the latest release artifacts (${p}): ${v.stack || v.message}`, "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND") : v;
      }
      return E.assets = r.assets, E;
    }
    get fileExtraDownloadHeaders() {
      return this.configureHeaders("application/octet-stream");
    }
    configureHeaders(l) {
      return {
        accept: l,
        authorization: `token ${this.token}`
      };
    }
    async getLatestVersionInfo(l) {
      const s = this.updater.allowPrerelease;
      let r = this.basePath;
      s || (r = `${r}/latest`);
      const i = (0, d.newUrlFromBase)(r, this.baseUrl);
      try {
        const p = JSON.parse(await this.httpRequest(i, this.configureHeaders("application/vnd.github.v3+json"), l));
        return s ? p.find((E) => E.prerelease) || p[0] : p;
      } catch (p) {
        throw (0, e.newError)(`Unable to find latest version on GitHub (${i}), please ensure a production release exists: ${p.stack || p.message}`, "ERR_UPDATER_LATEST_VERSION_NOT_FOUND");
      }
    }
    get basePath() {
      return this.computeGithubBasePath(`/repos/${this.options.owner}/${this.options.repo}/releases`);
    }
    resolveFiles(l) {
      return (0, o.getFileList)(l).map((s) => {
        const r = h.posix.basename(s.url).replace(/ /g, "-"), i = l.assets.find((p) => p != null && p.name === r);
        if (i == null)
          throw (0, e.newError)(`Cannot find asset "${r}" in: ${JSON.stringify(l.assets, null, 2)}`, "ERR_UPDATER_ASSET_NOT_FOUND");
        return {
          url: new u.URL(i.url),
          info: s
        };
      });
    }
  };
  return dr.PrivateGitHubProvider = c, dr;
}
var bl;
function vd() {
  if (bl) return lr;
  bl = 1, Object.defineProperty(lr, "__esModule", { value: !0 }), lr.isUrlProbablySupportMultiRangeRequests = c, lr.createClient = a;
  const e = Be(), n = pd(), h = $u(), u = Mu(), d = md(), f = gd(), o = Ed();
  function c(l) {
    return !l.includes("s3.amazonaws.com");
  }
  function a(l, s, r) {
    if (typeof l == "string")
      throw (0, e.newError)("Please pass PublishConfiguration object", "ERR_UPDATER_INVALID_PROVIDER_CONFIGURATION");
    const i = l.provider;
    switch (i) {
      case "github": {
        const p = l, E = (p.private ? process.env.GH_TOKEN || process.env.GITHUB_TOKEN : null) || p.token;
        return E == null ? new u.GitHubProvider(p, s, r) : new o.PrivateGitHubProvider(p, s, E, r);
      }
      case "bitbucket":
        return new n.BitbucketProvider(l, s, r);
      case "gitlab":
        return new d.GitLabProvider(l, s, r);
      case "keygen":
        return new f.KeygenProvider(l, s, r);
      case "s3":
      case "spaces":
        return new h.GenericProvider({
          provider: "generic",
          url: (0, e.getS3LikeProviderBaseUrl)(l),
          channel: l.channel || null
        }, s, {
          ...r,
          // https://github.com/minio/minio/issues/5285#issuecomment-350428955
          isUseMultipleRangeRequest: !1
        });
      case "generic": {
        const p = l;
        return new h.GenericProvider(p, s, {
          ...r,
          isUseMultipleRangeRequest: p.useMultipleRangeRequest !== !1 && c(p.url)
        });
      }
      case "custom": {
        const p = l, E = p.updateProvider;
        if (!E)
          throw (0, e.newError)("Custom provider not specified", "ERR_UPDATER_INVALID_PROVIDER_CONFIGURATION");
        return new E(p, s, r);
      }
      default:
        throw (0, e.newError)(`Unsupported provider: ${i}`, "ERR_UPDATER_UNSUPPORTED_PROVIDER");
    }
  }
  return lr;
}
var hr = {}, pr = {}, Xt = {}, Yt = {}, Sl;
function Io() {
  if (Sl) return Yt;
  Sl = 1, Object.defineProperty(Yt, "__esModule", { value: !0 }), Yt.OperationKind = void 0, Yt.computeOperations = n;
  var e;
  (function(o) {
    o[o.COPY = 0] = "COPY", o[o.DOWNLOAD = 1] = "DOWNLOAD";
  })(e || (Yt.OperationKind = e = {}));
  function n(o, c, a) {
    const l = f(o.files), s = f(c.files);
    let r = null;
    const i = c.files[0], p = [], E = i.name, v = l.get(E);
    if (v == null)
      throw new Error(`no file ${E} in old blockmap`);
    const m = s.get(E);
    let _ = 0;
    const { checksumToOffset: R, checksumToOldSize: O } = d(l.get(E), v.offset, a);
    let I = i.offset;
    for (let b = 0; b < m.checksums.length; I += m.sizes[b], b++) {
      const P = m.sizes[b], C = m.checksums[b];
      let T = R.get(C);
      T != null && O.get(C) !== P && (a.warn(`Checksum ("${C}") matches, but size differs (old: ${O.get(C)}, new: ${P})`), T = void 0), T === void 0 ? (_++, r != null && r.kind === e.DOWNLOAD && r.end === I ? r.end += P : (r = {
        kind: e.DOWNLOAD,
        start: I,
        end: I + P
        // oldBlocks: null,
      }, u(r, p, C, b))) : r != null && r.kind === e.COPY && r.end === T ? r.end += P : (r = {
        kind: e.COPY,
        start: T,
        end: T + P
        // oldBlocks: [checksum]
      }, u(r, p, C, b));
    }
    return _ > 0 && a.info(`File${i.name === "file" ? "" : " " + i.name} has ${_} changed blocks`), p;
  }
  const h = process.env.DIFFERENTIAL_DOWNLOAD_PLAN_BUILDER_VALIDATE_RANGES === "true";
  function u(o, c, a, l) {
    if (h && c.length !== 0) {
      const s = c[c.length - 1];
      if (s.kind === o.kind && o.start < s.end && o.start > s.start) {
        const r = [s.start, s.end, o.start, o.end].reduce((i, p) => i < p ? i : p);
        throw new Error(`operation (block index: ${l}, checksum: ${a}, kind: ${e[o.kind]}) overlaps previous operation (checksum: ${a}):
abs: ${s.start} until ${s.end} and ${o.start} until ${o.end}
rel: ${s.start - r} until ${s.end - r} and ${o.start - r} until ${o.end - r}`);
      }
    }
    c.push(o);
  }
  function d(o, c, a) {
    const l = /* @__PURE__ */ new Map(), s = /* @__PURE__ */ new Map();
    let r = c;
    for (let i = 0; i < o.checksums.length; i++) {
      const p = o.checksums[i], E = o.sizes[i], v = s.get(p);
      if (v === void 0)
        l.set(p, r), s.set(p, E);
      else if (a.debug != null) {
        const m = v === E ? "(same size)" : `(size: ${v}, this size: ${E})`;
        a.debug(`${p} duplicated in blockmap ${m}, it doesn't lead to broken differential downloader, just corresponding block will be skipped)`);
      }
      r += E;
    }
    return { checksumToOffset: l, checksumToOldSize: s };
  }
  function f(o) {
    const c = /* @__PURE__ */ new Map();
    for (const a of o)
      c.set(a.name, a);
    return c;
  }
  return Yt;
}
var Cl;
function Bu() {
  if (Cl) return Xt;
  Cl = 1, Object.defineProperty(Xt, "__esModule", { value: !0 }), Xt.DataSplitter = void 0, Xt.copyData = o;
  const e = Be(), n = yt, h = Cr, u = Io(), d = Buffer.from(`\r
\r
`);
  var f;
  (function(a) {
    a[a.INIT = 0] = "INIT", a[a.HEADER = 1] = "HEADER", a[a.BODY = 2] = "BODY";
  })(f || (f = {}));
  function o(a, l, s, r, i) {
    const p = (0, n.createReadStream)("", {
      fd: s,
      autoClose: !1,
      start: a.start,
      // end is inclusive
      end: a.end - 1
    });
    p.on("error", r), p.once("end", i), p.pipe(l, {
      end: !1
    });
  }
  let c = class extends h.Writable {
    constructor(l, s, r, i, p, E, v, m) {
      super(), this.out = l, this.options = s, this.partIndexToTaskIndex = r, this.partIndexToLength = p, this.finishHandler = E, this.grandTotalBytes = v, this.onProgress = m, this.start = Date.now(), this.nextUpdate = this.start + 1e3, this.transferred = 0, this.delta = 0, this.partIndex = -1, this.headerListBuffer = null, this.readState = f.INIT, this.ignoreByteCount = 0, this.remainingPartDataCount = 0, this.actualPartLength = 0, this.boundaryLength = i.length + 4, this.ignoreByteCount = this.boundaryLength - 2;
    }
    get isFinished() {
      return this.partIndex === this.partIndexToLength.length;
    }
    // noinspection JSUnusedGlobalSymbols
    _write(l, s, r) {
      if (this.isFinished) {
        console.error(`Trailing ignored data: ${l.length} bytes`);
        return;
      }
      this.handleData(l).then(() => {
        if (this.onProgress) {
          const i = Date.now();
          (i >= this.nextUpdate || this.transferred === this.grandTotalBytes) && this.grandTotalBytes && (i - this.start) / 1e3 && (this.nextUpdate = i + 1e3, this.onProgress({
            total: this.grandTotalBytes,
            delta: this.delta,
            transferred: this.transferred,
            percent: this.transferred / this.grandTotalBytes * 100,
            bytesPerSecond: Math.round(this.transferred / ((i - this.start) / 1e3))
          }), this.delta = 0);
        }
        r();
      }).catch(r);
    }
    async handleData(l) {
      let s = 0;
      if (this.ignoreByteCount !== 0 && this.remainingPartDataCount !== 0)
        throw (0, e.newError)("Internal error", "ERR_DATA_SPLITTER_BYTE_COUNT_MISMATCH");
      if (this.ignoreByteCount > 0) {
        const r = Math.min(this.ignoreByteCount, l.length);
        this.ignoreByteCount -= r, s = r;
      } else if (this.remainingPartDataCount > 0) {
        const r = Math.min(this.remainingPartDataCount, l.length);
        this.remainingPartDataCount -= r, await this.processPartData(l, 0, r), s = r;
      }
      if (s !== l.length) {
        if (this.readState === f.HEADER) {
          const r = this.searchHeaderListEnd(l, s);
          if (r === -1)
            return;
          s = r, this.readState = f.BODY, this.headerListBuffer = null;
        }
        for (; ; ) {
          if (this.readState === f.BODY)
            this.readState = f.INIT;
          else {
            this.partIndex++;
            let E = this.partIndexToTaskIndex.get(this.partIndex);
            if (E == null)
              if (this.isFinished)
                E = this.options.end;
              else
                throw (0, e.newError)("taskIndex is null", "ERR_DATA_SPLITTER_TASK_INDEX_IS_NULL");
            const v = this.partIndex === 0 ? this.options.start : this.partIndexToTaskIndex.get(this.partIndex - 1) + 1;
            if (v < E)
              await this.copyExistingData(v, E);
            else if (v > E)
              throw (0, e.newError)("prevTaskIndex must be < taskIndex", "ERR_DATA_SPLITTER_TASK_INDEX_ASSERT_FAILED");
            if (this.isFinished) {
              this.onPartEnd(), this.finishHandler();
              return;
            }
            if (s = this.searchHeaderListEnd(l, s), s === -1) {
              this.readState = f.HEADER;
              return;
            }
          }
          const r = this.partIndexToLength[this.partIndex], i = s + r, p = Math.min(i, l.length);
          if (await this.processPartStarted(l, s, p), this.remainingPartDataCount = r - (p - s), this.remainingPartDataCount > 0)
            return;
          if (s = i + this.boundaryLength, s >= l.length) {
            this.ignoreByteCount = this.boundaryLength - (l.length - i);
            return;
          }
        }
      }
    }
    copyExistingData(l, s) {
      return new Promise((r, i) => {
        const p = () => {
          if (l === s) {
            r();
            return;
          }
          const E = this.options.tasks[l];
          if (E.kind !== u.OperationKind.COPY) {
            i(new Error("Task kind must be COPY"));
            return;
          }
          o(E, this.out, this.options.oldFileFd, i, () => {
            l++, p();
          });
        };
        p();
      });
    }
    searchHeaderListEnd(l, s) {
      const r = l.indexOf(d, s);
      if (r !== -1)
        return r + d.length;
      const i = s === 0 ? l : l.slice(s);
      return this.headerListBuffer == null ? this.headerListBuffer = i : this.headerListBuffer = Buffer.concat([this.headerListBuffer, i]), -1;
    }
    onPartEnd() {
      const l = this.partIndexToLength[this.partIndex - 1];
      if (this.actualPartLength !== l)
        throw (0, e.newError)(`Expected length: ${l} differs from actual: ${this.actualPartLength}`, "ERR_DATA_SPLITTER_LENGTH_MISMATCH");
      this.actualPartLength = 0;
    }
    processPartStarted(l, s, r) {
      return this.partIndex !== 0 && this.onPartEnd(), this.processPartData(l, s, r);
    }
    processPartData(l, s, r) {
      this.actualPartLength += r - s, this.transferred += r - s, this.delta += r - s;
      const i = this.out;
      return i.write(s === 0 && l.length === r ? l : l.slice(s, r)) ? Promise.resolve() : new Promise((p, E) => {
        i.on("error", E), i.once("drain", () => {
          i.removeListener("error", E), p();
        });
      });
    }
  };
  return Xt.DataSplitter = c, Xt;
}
var mr = {}, Ol;
function yd() {
  if (Ol) return mr;
  Ol = 1, Object.defineProperty(mr, "__esModule", { value: !0 }), mr.executeTasksUsingMultipleRangeRequests = u, mr.checkIsRangesSupported = f;
  const e = Be(), n = Bu(), h = Io();
  function u(o, c, a, l, s) {
    const r = (i) => {
      if (i >= c.length) {
        o.fileMetadataBuffer != null && a.write(o.fileMetadataBuffer), a.end();
        return;
      }
      const p = i + 1e3;
      d(o, {
        tasks: c,
        start: i,
        end: Math.min(c.length, p),
        oldFileFd: l
      }, a, () => r(p), s);
    };
    return r;
  }
  function d(o, c, a, l, s) {
    let r = "bytes=", i = 0, p = 0;
    const E = /* @__PURE__ */ new Map(), v = [];
    for (let R = c.start; R < c.end; R++) {
      const O = c.tasks[R];
      O.kind === h.OperationKind.DOWNLOAD && (r += `${O.start}-${O.end - 1}, `, E.set(i, R), i++, v.push(O.end - O.start), p += O.end - O.start);
    }
    if (i <= 1) {
      const R = (O) => {
        if (O >= c.end) {
          l();
          return;
        }
        const I = c.tasks[O++];
        if (I.kind === h.OperationKind.COPY)
          (0, n.copyData)(I, a, c.oldFileFd, s, () => R(O));
        else {
          const b = o.createRequestOptions();
          b.headers.Range = `bytes=${I.start}-${I.end - 1}`;
          const P = o.httpExecutor.createRequest(b, (C) => {
            C.on("error", s), f(C, s) && (C.pipe(a, {
              end: !1
            }), C.once("end", () => R(O)));
          });
          o.httpExecutor.addErrorAndTimeoutHandlers(P, s), P.end();
        }
      };
      R(c.start);
      return;
    }
    const m = o.createRequestOptions();
    m.headers.Range = r.substring(0, r.length - 2);
    const _ = o.httpExecutor.createRequest(m, (R) => {
      if (!f(R, s))
        return;
      const O = (0, e.safeGetHeader)(R, "content-type"), I = /^multipart\/.+?\s*;\s*boundary=(?:"([^"]+)"|([^\s";]+))\s*$/i.exec(O);
      if (I == null) {
        s(new Error(`Content-Type "multipart/byteranges" is expected, but got "${O}"`));
        return;
      }
      const b = new n.DataSplitter(a, c, E, I[1] || I[2], v, l, p, o.options.onProgress);
      b.on("error", s), R.pipe(b), R.on("end", () => {
        setTimeout(() => {
          _.abort(), s(new Error("Response ends without calling any handlers"));
        }, 1e4);
      });
    });
    o.httpExecutor.addErrorAndTimeoutHandlers(_, s), _.end();
  }
  function f(o, c) {
    if (o.statusCode >= 400)
      return c((0, e.createHttpError)(o)), !1;
    if (o.statusCode !== 206) {
      const a = (0, e.safeGetHeader)(o, "accept-ranges");
      if (a == null || a === "none")
        return c(new Error(`Server doesn't support Accept-Ranges (response code ${o.statusCode})`)), !1;
    }
    return !0;
  }
  return mr;
}
var gr = {}, Nl;
function wd() {
  if (Nl) return gr;
  Nl = 1, Object.defineProperty(gr, "__esModule", { value: !0 }), gr.ProgressDifferentialDownloadCallbackTransform = void 0;
  const e = Cr;
  var n;
  (function(u) {
    u[u.COPY = 0] = "COPY", u[u.DOWNLOAD = 1] = "DOWNLOAD";
  })(n || (n = {}));
  let h = class extends e.Transform {
    constructor(d, f, o) {
      super(), this.progressDifferentialDownloadInfo = d, this.cancellationToken = f, this.onProgress = o, this.start = Date.now(), this.transferred = 0, this.delta = 0, this.expectedBytes = 0, this.index = 0, this.operationType = n.COPY, this.nextUpdate = this.start + 1e3;
    }
    _transform(d, f, o) {
      if (this.cancellationToken.cancelled) {
        o(new Error("cancelled"), null);
        return;
      }
      if (this.operationType == n.COPY) {
        o(null, d);
        return;
      }
      this.transferred += d.length, this.delta += d.length;
      const c = Date.now();
      c >= this.nextUpdate && this.transferred !== this.expectedBytes && this.transferred !== this.progressDifferentialDownloadInfo.grandTotal && (this.nextUpdate = c + 1e3, this.onProgress({
        total: this.progressDifferentialDownloadInfo.grandTotal,
        delta: this.delta,
        transferred: this.transferred,
        percent: this.transferred / this.progressDifferentialDownloadInfo.grandTotal * 100,
        bytesPerSecond: Math.round(this.transferred / ((c - this.start) / 1e3))
      }), this.delta = 0), o(null, d);
    }
    beginFileCopy() {
      this.operationType = n.COPY;
    }
    beginRangeDownload() {
      this.operationType = n.DOWNLOAD, this.expectedBytes += this.progressDifferentialDownloadInfo.expectedByteCounts[this.index++];
    }
    endRangeDownload() {
      this.transferred !== this.progressDifferentialDownloadInfo.grandTotal && this.onProgress({
        total: this.progressDifferentialDownloadInfo.grandTotal,
        delta: this.delta,
        transferred: this.transferred,
        percent: this.transferred / this.progressDifferentialDownloadInfo.grandTotal * 100,
        bytesPerSecond: Math.round(this.transferred / ((Date.now() - this.start) / 1e3))
      });
    }
    // Called when we are 100% done with the connection/download
    _flush(d) {
      if (this.cancellationToken.cancelled) {
        d(new Error("cancelled"));
        return;
      }
      this.onProgress({
        total: this.progressDifferentialDownloadInfo.grandTotal,
        delta: this.delta,
        transferred: this.transferred,
        percent: 100,
        bytesPerSecond: Math.round(this.transferred / ((Date.now() - this.start) / 1e3))
      }), this.delta = 0, this.transferred = 0, d(null);
    }
  };
  return gr.ProgressDifferentialDownloadCallbackTransform = h, gr;
}
var Pl;
function ju() {
  if (Pl) return pr;
  Pl = 1, Object.defineProperty(pr, "__esModule", { value: !0 }), pr.DifferentialDownloader = void 0;
  const e = Be(), n = /* @__PURE__ */ _t(), h = yt, u = Bu(), d = wt, f = Io(), o = yd(), c = wd();
  let a = class {
    // noinspection TypeScriptAbstractClassConstructorCanBeMadeProtected
    constructor(i, p, E) {
      this.blockAwareFileInfo = i, this.httpExecutor = p, this.options = E, this.fileMetadataBuffer = null, this.logger = E.logger;
    }
    createRequestOptions() {
      const i = {
        headers: {
          ...this.options.requestHeaders,
          accept: "*/*"
        }
      };
      return (0, e.configureRequestUrl)(this.options.newUrl, i), (0, e.configureRequestOptions)(i), i;
    }
    doDownload(i, p) {
      if (i.version !== p.version)
        throw new Error(`version is different (${i.version} - ${p.version}), full download is required`);
      const E = this.logger, v = (0, f.computeOperations)(i, p, E);
      E.debug != null && E.debug(JSON.stringify(v, null, 2));
      let m = 0, _ = 0;
      for (const O of v) {
        const I = O.end - O.start;
        O.kind === f.OperationKind.DOWNLOAD ? m += I : _ += I;
      }
      const R = this.blockAwareFileInfo.size;
      if (m + _ + (this.fileMetadataBuffer == null ? 0 : this.fileMetadataBuffer.length) !== R)
        throw new Error(`Internal error, size mismatch: downloadSize: ${m}, copySize: ${_}, newSize: ${R}`);
      return E.info(`Full: ${l(R)}, To download: ${l(m)} (${Math.round(m / (R / 100))}%)`), this.downloadFile(v);
    }
    downloadFile(i) {
      const p = [], E = () => Promise.all(p.map((v) => (0, n.close)(v.descriptor).catch((m) => {
        this.logger.error(`cannot close file "${v.path}": ${m}`);
      })));
      return this.doDownloadFile(i, p).then(E).catch((v) => E().catch((m) => {
        try {
          this.logger.error(`cannot close files: ${m}`);
        } catch (_) {
          try {
            console.error(_);
          } catch {
          }
        }
        throw v;
      }).then(() => {
        throw v;
      }));
    }
    async doDownloadFile(i, p) {
      const E = await (0, n.open)(this.options.oldFile, "r");
      p.push({ descriptor: E, path: this.options.oldFile });
      const v = await (0, n.open)(this.options.newFile, "w");
      p.push({ descriptor: v, path: this.options.newFile });
      const m = (0, h.createWriteStream)(this.options.newFile, { fd: v });
      await new Promise((_, R) => {
        const O = [];
        let I;
        if (!this.options.isUseMultipleRangeRequest && this.options.onProgress) {
          const k = [];
          let M = 0;
          for (const F of i)
            F.kind === f.OperationKind.DOWNLOAD && (k.push(F.end - F.start), M += F.end - F.start);
          const U = {
            expectedByteCounts: k,
            grandTotal: M
          };
          I = new c.ProgressDifferentialDownloadCallbackTransform(U, this.options.cancellationToken, this.options.onProgress), O.push(I);
        }
        const b = new e.DigestTransform(this.blockAwareFileInfo.sha512);
        b.isValidateOnEnd = !1, O.push(b), m.on("finish", () => {
          m.close(() => {
            p.splice(1, 1);
            try {
              b.validate();
            } catch (k) {
              R(k);
              return;
            }
            _(void 0);
          });
        }), O.push(m);
        let P = null;
        for (const k of O)
          k.on("error", R), P == null ? P = k : P = P.pipe(k);
        const C = O[0];
        let T;
        if (this.options.isUseMultipleRangeRequest) {
          T = (0, o.executeTasksUsingMultipleRangeRequests)(this, i, C, E, R), T(0);
          return;
        }
        let N = 0, w = null;
        this.logger.info(`Differential download: ${this.options.newUrl}`);
        const q = this.createRequestOptions();
        q.redirect = "manual", T = (k) => {
          var M, U;
          if (k >= i.length) {
            this.fileMetadataBuffer != null && C.write(this.fileMetadataBuffer), C.end();
            return;
          }
          const F = i[k++];
          if (F.kind === f.OperationKind.COPY) {
            I && I.beginFileCopy(), (0, u.copyData)(F, C, E, R, () => T(k));
            return;
          }
          const H = `bytes=${F.start}-${F.end - 1}`;
          q.headers.range = H, (U = (M = this.logger) === null || M === void 0 ? void 0 : M.debug) === null || U === void 0 || U.call(M, `download range: ${H}`), I && I.beginRangeDownload();
          const L = this.httpExecutor.createRequest(q, (G) => {
            G.on("error", R), G.on("aborted", () => {
              R(new Error("response has been aborted by the server"));
            }), G.statusCode >= 400 && R((0, e.createHttpError)(G)), G.pipe(C, {
              end: !1
            }), G.once("end", () => {
              I && I.endRangeDownload(), ++N === 100 ? (N = 0, setTimeout(() => T(k), 1e3)) : T(k);
            });
          });
          L.on("redirect", (G, X, ee) => {
            this.logger.info(`Redirect to ${s(ee)}`), w = ee, (0, e.configureRequestUrl)(new d.URL(w), q), L.followRedirect();
          }), this.httpExecutor.addErrorAndTimeoutHandlers(L, R), L.end();
        }, T(0);
      });
    }
    async readRemoteBytes(i, p) {
      const E = Buffer.allocUnsafe(p + 1 - i), v = this.createRequestOptions();
      v.headers.range = `bytes=${i}-${p}`;
      let m = 0;
      if (await this.request(v, (_) => {
        _.copy(E, m), m += _.length;
      }), m !== E.length)
        throw new Error(`Received data length ${m} is not equal to expected ${E.length}`);
      return E;
    }
    request(i, p) {
      return new Promise((E, v) => {
        const m = this.httpExecutor.createRequest(i, (_) => {
          (0, o.checkIsRangesSupported)(_, v) && (_.on("error", v), _.on("aborted", () => {
            v(new Error("response has been aborted by the server"));
          }), _.on("data", p), _.on("end", () => E()));
        });
        this.httpExecutor.addErrorAndTimeoutHandlers(m, v), m.end();
      });
    }
  };
  pr.DifferentialDownloader = a;
  function l(r, i = " KB") {
    return new Intl.NumberFormat("en").format((r / 1024).toFixed(2)) + i;
  }
  function s(r) {
    const i = r.indexOf("?");
    return i < 0 ? r : r.substring(0, i);
  }
  return pr;
}
var Dl;
function _d() {
  if (Dl) return hr;
  Dl = 1, Object.defineProperty(hr, "__esModule", { value: !0 }), hr.GenericDifferentialDownloader = void 0;
  const e = ju();
  let n = class extends e.DifferentialDownloader {
    download(u, d) {
      return this.doDownload(u, d);
    }
  };
  return hr.GenericDifferentialDownloader = n, hr;
}
var co = {}, Il;
function Mt() {
  return Il || (Il = 1, (function(e) {
    Object.defineProperty(e, "__esModule", { value: !0 }), e.UpdaterSignal = e.UPDATE_DOWNLOADED = e.DOWNLOAD_PROGRESS = e.CancellationToken = void 0, e.addHandler = u;
    const n = Be();
    Object.defineProperty(e, "CancellationToken", { enumerable: !0, get: function() {
      return n.CancellationToken;
    } }), e.DOWNLOAD_PROGRESS = "download-progress", e.UPDATE_DOWNLOADED = "update-downloaded";
    class h {
      constructor(f) {
        this.emitter = f;
      }
      /**
       * Emitted when an authenticating proxy is [asking for user credentials](https://github.com/electron/electron/blob/master/docs/api/client-request.md#event-login).
       */
      login(f) {
        u(this.emitter, "login", f);
      }
      progress(f) {
        u(this.emitter, e.DOWNLOAD_PROGRESS, f);
      }
      updateDownloaded(f) {
        u(this.emitter, e.UPDATE_DOWNLOADED, f);
      }
      updateCancelled(f) {
        u(this.emitter, "update-cancelled", f);
      }
    }
    e.UpdaterSignal = h;
    function u(d, f, o) {
      d.on(f, o);
    }
  })(co)), co;
}
var Ll;
function Lo() {
  if (Ll) return Ot;
  Ll = 1, Object.defineProperty(Ot, "__esModule", { value: !0 }), Ot.NoOpLogger = Ot.AppUpdater = void 0;
  const e = Be(), n = Or, h = en, u = cu, d = /* @__PURE__ */ _t(), f = bo(), o = qf(), c = Le, a = ku(), l = cd(), s = dd(), r = hd(), i = $u(), p = vd(), E = du, v = _d(), m = Mt();
  let _ = class Hu extends u.EventEmitter {
    /**
     * Get the update channel. Doesn't return `channel` from the update configuration, only if was previously set.
     */
    get channel() {
      return this._channel;
    }
    /**
     * Set the update channel. Overrides `channel` in the update configuration.
     *
     * `allowDowngrade` will be automatically set to `true`. If this behavior is not suitable for you, simple set `allowDowngrade` explicitly after.
     */
    set channel(b) {
      if (this._channel != null) {
        if (typeof b != "string")
          throw (0, e.newError)(`Channel must be a string, but got: ${b}`, "ERR_UPDATER_INVALID_CHANNEL");
        if (b.length === 0)
          throw (0, e.newError)("Channel must be not an empty string", "ERR_UPDATER_INVALID_CHANNEL");
      }
      this._channel = b, this.allowDowngrade = !0;
    }
    /**
     *  Shortcut for explicitly adding auth tokens to request headers
     */
    addAuthHeader(b) {
      this.requestHeaders = Object.assign({}, this.requestHeaders, {
        authorization: b
      });
    }
    // noinspection JSMethodCanBeStatic,JSUnusedGlobalSymbols
    get netSession() {
      return (0, r.getNetSession)();
    }
    /**
     * The logger. You can pass [electron-log](https://github.com/megahertz/electron-log), [winston](https://github.com/winstonjs/winston) or another logger with the following interface: `{ info(), warn(), error() }`.
     * Set it to `null` if you would like to disable a logging feature.
     */
    get logger() {
      return this._logger;
    }
    set logger(b) {
      this._logger = b ?? new O();
    }
    // noinspection JSUnusedGlobalSymbols
    /**
     * test only
     * @private
     */
    set updateConfigPath(b) {
      this.clientPromise = null, this._appUpdateConfigPath = b, this.configOnDisk = new o.Lazy(() => this.loadUpdateConfig());
    }
    /**
     * Allows developer to override default logic for determining if an update is supported.
     * The default logic compares the `UpdateInfo` minimum system version against the `os.release()` with `semver` package
     */
    get isUpdateSupported() {
      return this._isUpdateSupported;
    }
    set isUpdateSupported(b) {
      b && (this._isUpdateSupported = b);
    }
    /**
     * Allows developer to override default logic for determining if the user is below the rollout threshold.
     * The default logic compares the staging percentage with numerical representation of user ID.
     * An override can define custom logic, or bypass it if needed.
     */
    get isUserWithinRollout() {
      return this._isUserWithinRollout;
    }
    set isUserWithinRollout(b) {
      b && (this._isUserWithinRollout = b);
    }
    constructor(b, P) {
      super(), this.autoDownload = !0, this.autoInstallOnAppQuit = !0, this.autoRunAppAfterInstall = !0, this.allowPrerelease = !1, this.fullChangelog = !1, this.allowDowngrade = !1, this.disableWebInstaller = !1, this.disableDifferentialDownload = !1, this.forceDevUpdateConfig = !1, this.previousBlockmapBaseUrlOverride = null, this._channel = null, this.downloadedUpdateHelper = null, this.requestHeaders = null, this._logger = console, this.signals = new m.UpdaterSignal(this), this._appUpdateConfigPath = null, this._isUpdateSupported = (N) => this.checkIfUpdateSupported(N), this._isUserWithinRollout = (N) => this.isStagingMatch(N), this.clientPromise = null, this.stagingUserIdPromise = new o.Lazy(() => this.getOrCreateStagingUserId()), this.configOnDisk = new o.Lazy(() => this.loadUpdateConfig()), this.checkForUpdatesPromise = null, this.downloadPromise = null, this.updateInfoAndProvider = null, this._testOnlyOptions = null, this.on("error", (N) => {
        this._logger.error(`Error: ${N.stack || N.message}`);
      }), P == null ? (this.app = new s.ElectronAppAdapter(), this.httpExecutor = new r.ElectronHttpExecutor((N, w) => this.emit("login", N, w))) : (this.app = P, this.httpExecutor = null);
      const C = this.app.version, T = (0, a.parse)(C);
      if (T == null)
        throw (0, e.newError)(`App version is not a valid semver version: "${C}"`, "ERR_UPDATER_INVALID_VERSION");
      this.currentVersion = T, this.allowPrerelease = R(T), b != null && (this.setFeedURL(b), typeof b != "string" && b.requestHeaders && (this.requestHeaders = b.requestHeaders));
    }
    //noinspection JSMethodCanBeStatic,JSUnusedGlobalSymbols
    getFeedURL() {
      return "Deprecated. Do not use it.";
    }
    /**
     * Configure update provider. If value is `string`, [GenericServerOptions](./publish.md#genericserveroptions) will be set with value as `url`.
     * @param options If you want to override configuration in the `app-update.yml`.
     */
    setFeedURL(b) {
      const P = this.createProviderRuntimeOptions();
      let C;
      typeof b == "string" ? C = new i.GenericProvider({ provider: "generic", url: b }, this, {
        ...P,
        isUseMultipleRangeRequest: (0, p.isUrlProbablySupportMultiRangeRequests)(b)
      }) : C = (0, p.createClient)(b, this, P), this.clientPromise = Promise.resolve(C);
    }
    /**
     * Asks the server whether there is an update.
     * @returns null if the updater is disabled, otherwise info about the latest version
     */
    checkForUpdates() {
      if (!this.isUpdaterActive())
        return Promise.resolve(null);
      let b = this.checkForUpdatesPromise;
      if (b != null)
        return this._logger.info("Checking for update (already in progress)"), b;
      const P = () => this.checkForUpdatesPromise = null;
      return this._logger.info("Checking for update"), b = this.doCheckForUpdates().then((C) => (P(), C)).catch((C) => {
        throw P(), this.emit("error", C, `Cannot check for updates: ${(C.stack || C).toString()}`), C;
      }), this.checkForUpdatesPromise = b, b;
    }
    isUpdaterActive() {
      return this.app.isPackaged || this.forceDevUpdateConfig ? !0 : (this._logger.info("Skip checkForUpdates because application is not packed and dev update config is not forced"), !1);
    }
    // noinspection JSUnusedGlobalSymbols
    checkForUpdatesAndNotify(b) {
      return this.checkForUpdates().then((P) => P?.downloadPromise ? (P.downloadPromise.then(() => {
        const C = Hu.formatDownloadNotification(P.updateInfo.version, this.app.name, b);
        new kt.Notification(C).show();
      }), P) : (this._logger.debug != null && this._logger.debug("checkForUpdatesAndNotify called, downloadPromise is null"), P));
    }
    static formatDownloadNotification(b, P, C) {
      return C == null && (C = {
        title: "A new update is ready to install",
        body: "{appName} version {version} has been downloaded and will be automatically installed on exit"
      }), C = {
        title: C.title.replace("{appName}", P).replace("{version}", b),
        body: C.body.replace("{appName}", P).replace("{version}", b)
      }, C;
    }
    async isStagingMatch(b) {
      const P = b.stagingPercentage;
      let C = P;
      if (C == null)
        return !0;
      if (C = parseInt(C, 10), isNaN(C))
        return this._logger.warn(`Staging percentage is NaN: ${P}`), !0;
      C = C / 100;
      const T = await this.stagingUserIdPromise.value, w = e.UUID.parse(T).readUInt32BE(12) / 4294967295;
      return this._logger.info(`Staging percentage: ${C}, percentage: ${w}, user id: ${T}`), w < C;
    }
    computeFinalHeaders(b) {
      return this.requestHeaders != null && Object.assign(b, this.requestHeaders), b;
    }
    async isUpdateAvailable(b) {
      const P = (0, a.parse)(b.version);
      if (P == null)
        throw (0, e.newError)(`This file could not be downloaded, or the latest version (from update server) does not have a valid semver version: "${b.version}"`, "ERR_UPDATER_INVALID_VERSION");
      const C = this.currentVersion;
      if ((0, a.eq)(P, C) || !await Promise.resolve(this.isUpdateSupported(b)) || !await Promise.resolve(this.isUserWithinRollout(b)))
        return !1;
      const N = (0, a.gt)(P, C), w = (0, a.lt)(P, C);
      return N ? !0 : this.allowDowngrade && w;
    }
    checkIfUpdateSupported(b) {
      const P = b?.minimumSystemVersion, C = (0, h.release)();
      if (P)
        try {
          if ((0, a.lt)(C, P))
            return this._logger.info(`Current OS version ${C} is less than the minimum OS version required ${P} for version ${C}`), !1;
        } catch (T) {
          this._logger.warn(`Failed to compare current OS version(${C}) with minimum OS version(${P}): ${(T.message || T).toString()}`);
        }
      return !0;
    }
    async getUpdateInfoAndProvider() {
      await this.app.whenReady(), this.clientPromise == null && (this.clientPromise = this.configOnDisk.value.then((C) => (0, p.createClient)(C, this, this.createProviderRuntimeOptions())));
      const b = await this.clientPromise, P = await this.stagingUserIdPromise.value;
      return b.setRequestHeaders(this.computeFinalHeaders({ "x-user-staging-id": P })), {
        info: await b.getLatestVersion(),
        provider: b
      };
    }
    createProviderRuntimeOptions() {
      return {
        isUseMultipleRangeRequest: !0,
        platform: this._testOnlyOptions == null ? process.platform : this._testOnlyOptions.platform,
        executor: this.httpExecutor
      };
    }
    async doCheckForUpdates() {
      this.emit("checking-for-update");
      const b = await this.getUpdateInfoAndProvider(), P = b.info;
      if (!await this.isUpdateAvailable(P))
        return this._logger.info(`Update for version ${this.currentVersion.format()} is not available (latest version: ${P.version}, downgrade is ${this.allowDowngrade ? "allowed" : "disallowed"}).`), this.emit("update-not-available", P), {
          isUpdateAvailable: !1,
          versionInfo: P,
          updateInfo: P
        };
      this.updateInfoAndProvider = b, this.onUpdateAvailable(P);
      const C = new e.CancellationToken();
      return {
        isUpdateAvailable: !0,
        versionInfo: P,
        updateInfo: P,
        cancellationToken: C,
        downloadPromise: this.autoDownload ? this.downloadUpdate(C) : null
      };
    }
    onUpdateAvailable(b) {
      this._logger.info(`Found version ${b.version} (url: ${(0, e.asArray)(b.files).map((P) => P.url).join(", ")})`), this.emit("update-available", b);
    }
    /**
     * Start downloading update manually. You can use this method if `autoDownload` option is set to `false`.
     * @returns {Promise<Array<string>>} Paths to downloaded files.
     */
    downloadUpdate(b = new e.CancellationToken()) {
      const P = this.updateInfoAndProvider;
      if (P == null) {
        const T = new Error("Please check update first");
        return this.dispatchError(T), Promise.reject(T);
      }
      if (this.downloadPromise != null)
        return this._logger.info("Downloading update (already in progress)"), this.downloadPromise;
      this._logger.info(`Downloading update from ${(0, e.asArray)(P.info.files).map((T) => T.url).join(", ")}`);
      const C = (T) => {
        if (!(T instanceof e.CancellationError))
          try {
            this.dispatchError(T);
          } catch (N) {
            this._logger.warn(`Cannot dispatch error event: ${N.stack || N}`);
          }
        return T;
      };
      return this.downloadPromise = this.doDownloadUpdate({
        updateInfoAndProvider: P,
        requestHeaders: this.computeRequestHeaders(P.provider),
        cancellationToken: b,
        disableWebInstaller: this.disableWebInstaller,
        disableDifferentialDownload: this.disableDifferentialDownload
      }).catch((T) => {
        throw C(T);
      }).finally(() => {
        this.downloadPromise = null;
      }), this.downloadPromise;
    }
    dispatchError(b) {
      this.emit("error", b, (b.stack || b).toString());
    }
    dispatchUpdateDownloaded(b) {
      this.emit(m.UPDATE_DOWNLOADED, b);
    }
    async loadUpdateConfig() {
      return this._appUpdateConfigPath == null && (this._appUpdateConfigPath = this.app.appUpdateConfigPath), (0, f.load)(await (0, d.readFile)(this._appUpdateConfigPath, "utf-8"));
    }
    computeRequestHeaders(b) {
      const P = b.fileExtraDownloadHeaders;
      if (P != null) {
        const C = this.requestHeaders;
        return C == null ? P : {
          ...P,
          ...C
        };
      }
      return this.computeFinalHeaders({ accept: "*/*" });
    }
    async getOrCreateStagingUserId() {
      const b = c.join(this.app.userDataPath, ".updaterId");
      try {
        const C = await (0, d.readFile)(b, "utf-8");
        if (e.UUID.check(C))
          return C;
        this._logger.warn(`Staging user id file exists, but content was invalid: ${C}`);
      } catch (C) {
        C.code !== "ENOENT" && this._logger.warn(`Couldn't read staging user ID, creating a blank one: ${C}`);
      }
      const P = e.UUID.v5((0, n.randomBytes)(4096), e.UUID.OID);
      this._logger.info(`Generated new staging user ID: ${P}`);
      try {
        await (0, d.outputFile)(b, P);
      } catch (C) {
        this._logger.warn(`Couldn't write out staging user ID: ${C}`);
      }
      return P;
    }
    /** @internal */
    get isAddNoCacheQuery() {
      const b = this.requestHeaders;
      if (b == null)
        return !0;
      for (const P of Object.keys(b)) {
        const C = P.toLowerCase();
        if (C === "authorization" || C === "private-token")
          return !1;
      }
      return !0;
    }
    async getOrCreateDownloadHelper() {
      let b = this.downloadedUpdateHelper;
      if (b == null) {
        const P = (await this.configOnDisk.value).updaterCacheDirName, C = this._logger;
        P == null && C.error("updaterCacheDirName is not specified in app-update.yml Was app build using at least electron-builder 20.34.0?");
        const T = c.join(this.app.baseCachePath, P || this.app.name);
        C.debug != null && C.debug(`updater cache dir: ${T}`), b = new l.DownloadedUpdateHelper(T), this.downloadedUpdateHelper = b;
      }
      return b;
    }
    async executeDownload(b) {
      const P = b.fileInfo, C = {
        headers: b.downloadUpdateOptions.requestHeaders,
        cancellationToken: b.downloadUpdateOptions.cancellationToken,
        sha2: P.info.sha2,
        sha512: P.info.sha512
      };
      this.listenerCount(m.DOWNLOAD_PROGRESS) > 0 && (C.onProgress = (Z) => this.emit(m.DOWNLOAD_PROGRESS, Z));
      const T = b.downloadUpdateOptions.updateInfoAndProvider.info, N = T.version, w = P.packageInfo;
      function q() {
        const Z = decodeURIComponent(b.fileInfo.url.pathname);
        return Z.toLowerCase().endsWith(`.${b.fileExtension.toLowerCase()}`) ? c.basename(Z) : b.fileInfo.info.url;
      }
      const k = await this.getOrCreateDownloadHelper(), M = k.cacheDirForPendingUpdate;
      await (0, d.mkdir)(M, { recursive: !0 });
      const U = q();
      let F = c.join(M, U);
      const H = w == null ? null : c.join(M, `package-${N}${c.extname(w.path) || ".7z"}`), L = async (Z) => {
        await k.setDownloadedFile(F, H, T, P, U, Z), await b.done({
          ...T,
          downloadedFile: F
        });
        const ge = c.join(M, "current.blockmap");
        return await (0, d.pathExists)(ge) && await (0, d.copyFile)(ge, c.join(k.cacheDir, "current.blockmap")), H == null ? [F] : [F, H];
      }, G = this._logger, X = await k.validateDownloadedPath(F, T, P, G);
      if (X != null)
        return F = X, await L(!1);
      const ee = async () => (await k.clear().catch(() => {
      }), await (0, d.unlink)(F).catch(() => {
      })), he = await (0, l.createTempUpdateFile)(`temp-${U}`, M, G);
      try {
        await b.task(he, C, H, ee), await (0, e.retry)(() => (0, d.rename)(he, F), {
          retries: 60,
          interval: 500,
          shouldRetry: (Z) => Z instanceof Error && /^EBUSY:/.test(Z.message) ? !0 : (G.warn(`Cannot rename temp file to final file: ${Z.message || Z.stack}`), !1)
        });
      } catch (Z) {
        throw await ee(), Z instanceof e.CancellationError && (G.info("cancelled"), this.emit("update-cancelled", T)), Z;
      }
      return G.info(`New version ${N} has been downloaded to ${F}`), await L(!0);
    }
    async differentialDownloadInstaller(b, P, C, T, N) {
      try {
        if (this._testOnlyOptions != null && !this._testOnlyOptions.isUseDifferentialDownload)
          return !0;
        const w = P.updateInfoAndProvider.provider, q = await w.getBlockMapFiles(b.url, this.app.version, P.updateInfoAndProvider.info.version, this.previousBlockmapBaseUrlOverride);
        this._logger.info(`Download block maps (old: "${q[0]}", new: ${q[1]})`);
        const k = async (G) => {
          const X = await this.httpExecutor.downloadToBuffer(G, {
            headers: P.requestHeaders,
            cancellationToken: P.cancellationToken
          });
          if (X == null || X.length === 0)
            throw new Error(`Blockmap "${G.href}" is empty`);
          try {
            return JSON.parse((0, E.gunzipSync)(X).toString());
          } catch (ee) {
            throw new Error(`Cannot parse blockmap "${G.href}", error: ${ee}`);
          }
        }, M = {
          newUrl: b.url,
          oldFile: c.join(this.downloadedUpdateHelper.cacheDir, N),
          logger: this._logger,
          newFile: C,
          isUseMultipleRangeRequest: w.isUseMultipleRangeRequest,
          requestHeaders: P.requestHeaders,
          cancellationToken: P.cancellationToken
        };
        this.listenerCount(m.DOWNLOAD_PROGRESS) > 0 && (M.onProgress = (G) => this.emit(m.DOWNLOAD_PROGRESS, G));
        const U = async (G, X) => {
          const ee = c.join(X, "current.blockmap");
          await (0, d.outputFile)(ee, (0, E.gzipSync)(JSON.stringify(G)));
        }, F = async (G) => {
          const X = c.join(G, "current.blockmap");
          try {
            if (await (0, d.pathExists)(X))
              return JSON.parse((0, E.gunzipSync)(await (0, d.readFile)(X)).toString());
          } catch (ee) {
            this._logger.warn(`Cannot parse blockmap "${X}", error: ${ee}`);
          }
          return null;
        }, H = await k(q[1]);
        await U(H, this.downloadedUpdateHelper.cacheDirForPendingUpdate);
        let L = await F(this.downloadedUpdateHelper.cacheDir);
        return L == null && (L = await k(q[0])), await new v.GenericDifferentialDownloader(b.info, this.httpExecutor, M).download(L, H), !1;
      } catch (w) {
        if (this._logger.error(`Cannot download differentially, fallback to full download: ${w.stack || w}`), this._testOnlyOptions != null)
          throw w;
        return !0;
      }
    }
  };
  Ot.AppUpdater = _;
  function R(I) {
    const b = (0, a.prerelease)(I);
    return b != null && b.length > 0;
  }
  class O {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    info(b) {
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    warn(b) {
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    error(b) {
    }
  }
  return Ot.NoOpLogger = O, Ot;
}
var Fl;
function un() {
  if (Fl) return rr;
  Fl = 1, Object.defineProperty(rr, "__esModule", { value: !0 }), rr.BaseUpdater = void 0;
  const e = Zr, n = Lo();
  let h = class extends n.AppUpdater {
    constructor(d, f) {
      super(d, f), this.quitAndInstallCalled = !1, this.quitHandlerAdded = !1;
    }
    quitAndInstall(d = !1, f = !1) {
      this._logger.info("Install on explicit quitAndInstall"), this.install(d, d ? f : this.autoRunAppAfterInstall) ? setImmediate(() => {
        kt.autoUpdater.emit("before-quit-for-update"), this.app.quit();
      }) : this.quitAndInstallCalled = !1;
    }
    executeDownload(d) {
      return super.executeDownload({
        ...d,
        done: (f) => (this.dispatchUpdateDownloaded(f), this.addQuitHandler(), Promise.resolve())
      });
    }
    get installerPath() {
      return this.downloadedUpdateHelper == null ? null : this.downloadedUpdateHelper.file;
    }
    // must be sync (because quit even handler is not async)
    install(d = !1, f = !1) {
      if (this.quitAndInstallCalled)
        return this._logger.warn("install call ignored: quitAndInstallCalled is set to true"), !1;
      const o = this.downloadedUpdateHelper, c = this.installerPath, a = o == null ? null : o.downloadedFileInfo;
      if (c == null || a == null)
        return this.dispatchError(new Error("No update filepath provided, can't quit and install")), !1;
      this.quitAndInstallCalled = !0;
      try {
        return this._logger.info(`Install: isSilent: ${d}, isForceRunAfter: ${f}`), this.doInstall({
          isSilent: d,
          isForceRunAfter: f,
          isAdminRightsRequired: a.isAdminRightsRequired
        });
      } catch (l) {
        return this.dispatchError(l), !1;
      }
    }
    addQuitHandler() {
      this.quitHandlerAdded || !this.autoInstallOnAppQuit || (this.quitHandlerAdded = !0, this.app.onQuit((d) => {
        if (this.quitAndInstallCalled) {
          this._logger.info("Update installer has already been triggered. Quitting application.");
          return;
        }
        if (!this.autoInstallOnAppQuit) {
          this._logger.info("Update will not be installed on quit because autoInstallOnAppQuit is set to false.");
          return;
        }
        if (d !== 0) {
          this._logger.info(`Update will be not installed on quit because application is quitting with exit code ${d}`);
          return;
        }
        this._logger.info("Auto install update on quit"), this.install(!0, !1);
      }));
    }
    spawnSyncLog(d, f = [], o = {}) {
      this._logger.info(`Executing: ${d} with args: ${f}`);
      const c = (0, e.spawnSync)(d, f, {
        env: { ...process.env, ...o },
        encoding: "utf-8",
        shell: !0
      }), { error: a, status: l, stdout: s, stderr: r } = c;
      if (a != null)
        throw this._logger.error(r), a;
      if (l != null && l !== 0)
        throw this._logger.error(r), new Error(`Command ${d} exited with code ${l}`);
      return s.trim();
    }
    /**
     * This handles both node 8 and node 10 way of emitting error when spawning a process
     *   - node 8: Throws the error
     *   - node 10: Emit the error(Need to listen with on)
     */
    // https://github.com/electron-userland/electron-builder/issues/1129
    // Node 8 sends errors: https://nodejs.org/dist/latest-v8.x/docs/api/errors.html#errors_common_system_errors
    async spawnLog(d, f = [], o = void 0, c = "ignore") {
      return this._logger.info(`Executing: ${d} with args: ${f}`), new Promise((a, l) => {
        try {
          const s = { stdio: c, env: o, detached: !0 }, r = (0, e.spawn)(d, f, s);
          r.on("error", (i) => {
            l(i);
          }), r.unref(), r.pid !== void 0 && a(!0);
        } catch (s) {
          l(s);
        }
      });
    }
  };
  return rr.BaseUpdater = h, rr;
}
var Er = {}, vr = {}, Ul;
function Gu() {
  if (Ul) return vr;
  Ul = 1, Object.defineProperty(vr, "__esModule", { value: !0 }), vr.FileWithEmbeddedBlockMapDifferentialDownloader = void 0;
  const e = /* @__PURE__ */ _t(), n = ju(), h = du;
  let u = class extends n.DifferentialDownloader {
    async download() {
      const c = this.blockAwareFileInfo, a = c.size, l = a - (c.blockMapSize + 4);
      this.fileMetadataBuffer = await this.readRemoteBytes(l, a - 1);
      const s = d(this.fileMetadataBuffer.slice(0, this.fileMetadataBuffer.length - 4));
      await this.doDownload(await f(this.options.oldFile), s);
    }
  };
  vr.FileWithEmbeddedBlockMapDifferentialDownloader = u;
  function d(o) {
    return JSON.parse((0, h.inflateRawSync)(o).toString());
  }
  async function f(o) {
    const c = await (0, e.open)(o, "r");
    try {
      const a = (await (0, e.fstat)(c)).size, l = Buffer.allocUnsafe(4);
      await (0, e.read)(c, l, 0, l.length, a - l.length);
      const s = Buffer.allocUnsafe(l.readUInt32BE(0));
      return await (0, e.read)(c, s, 0, s.length, a - l.length - s.length), await (0, e.close)(c), d(s);
    } catch (a) {
      throw await (0, e.close)(c), a;
    }
  }
  return vr;
}
var xl;
function kl() {
  if (xl) return Er;
  xl = 1, Object.defineProperty(Er, "__esModule", { value: !0 }), Er.AppImageUpdater = void 0;
  const e = Be(), n = Zr, h = /* @__PURE__ */ _t(), u = yt, d = Le, f = un(), o = Gu(), c = Qe(), a = Mt();
  let l = class extends f.BaseUpdater {
    constructor(r, i) {
      super(r, i);
    }
    isUpdaterActive() {
      return process.env.APPIMAGE == null && !this.forceDevUpdateConfig ? (process.env.SNAP == null ? this._logger.warn("APPIMAGE env is not defined, current application is not an AppImage") : this._logger.info("SNAP env is defined, updater is disabled"), !1) : super.isUpdaterActive();
    }
    /*** @private */
    doDownloadUpdate(r) {
      const i = r.updateInfoAndProvider.provider, p = (0, c.findFile)(i.resolveFiles(r.updateInfoAndProvider.info), "AppImage", ["rpm", "deb", "pacman"]);
      return this.executeDownload({
        fileExtension: "AppImage",
        fileInfo: p,
        downloadUpdateOptions: r,
        task: async (E, v) => {
          const m = process.env.APPIMAGE;
          if (m == null)
            throw (0, e.newError)("APPIMAGE env is not defined", "ERR_UPDATER_OLD_FILE_NOT_FOUND");
          (r.disableDifferentialDownload || await this.downloadDifferential(p, m, E, i, r)) && await this.httpExecutor.download(p.url, E, v), await (0, h.chmod)(E, 493);
        }
      });
    }
    async downloadDifferential(r, i, p, E, v) {
      try {
        const m = {
          newUrl: r.url,
          oldFile: i,
          logger: this._logger,
          newFile: p,
          isUseMultipleRangeRequest: E.isUseMultipleRangeRequest,
          requestHeaders: v.requestHeaders,
          cancellationToken: v.cancellationToken
        };
        return this.listenerCount(a.DOWNLOAD_PROGRESS) > 0 && (m.onProgress = (_) => this.emit(a.DOWNLOAD_PROGRESS, _)), await new o.FileWithEmbeddedBlockMapDifferentialDownloader(r.info, this.httpExecutor, m).download(), !1;
      } catch (m) {
        return this._logger.error(`Cannot download differentially, fallback to full download: ${m.stack || m}`), process.platform === "linux";
      }
    }
    doInstall(r) {
      const i = process.env.APPIMAGE;
      if (i == null)
        throw (0, e.newError)("APPIMAGE env is not defined", "ERR_UPDATER_OLD_FILE_NOT_FOUND");
      (0, u.unlinkSync)(i);
      let p;
      const E = d.basename(i), v = this.installerPath;
      if (v == null)
        return this.dispatchError(new Error("No update filepath provided, can't quit and install")), !1;
      d.basename(v) === E || !/\d+\.\d+\.\d+/.test(E) ? p = i : p = d.join(d.dirname(i), d.basename(v)), (0, n.execFileSync)("mv", ["-f", v, p]), p !== i && this.emit("appimage-filename-updated", p);
      const m = {
        ...process.env,
        APPIMAGE_SILENT_INSTALL: "true"
      };
      return r.isForceRunAfter ? this.spawnLog(p, [], m) : (m.APPIMAGE_EXIT_AFTER_INSTALL = "true", (0, n.execFileSync)(p, [], { env: m })), !0;
    }
  };
  return Er.AppImageUpdater = l, Er;
}
var yr = {}, wr = {}, ql;
function Fo() {
  if (ql) return wr;
  ql = 1, Object.defineProperty(wr, "__esModule", { value: !0 }), wr.LinuxUpdater = void 0;
  const e = un();
  let n = class extends e.BaseUpdater {
    constructor(u, d) {
      super(u, d);
    }
    /**
     * Returns true if the current process is running as root.
     */
    isRunningAsRoot() {
      var u;
      return ((u = process.getuid) === null || u === void 0 ? void 0 : u.call(process)) === 0;
    }
    /**
     * Sanitizies the installer path for using with command line tools.
     */
    get installerPath() {
      var u, d;
      return (d = (u = super.installerPath) === null || u === void 0 ? void 0 : u.replace(/\\/g, "\\\\").replace(/ /g, "\\ ")) !== null && d !== void 0 ? d : null;
    }
    runCommandWithSudoIfNeeded(u) {
      if (this.isRunningAsRoot())
        return this._logger.info("Running as root, no need to use sudo"), this.spawnSyncLog(u[0], u.slice(1));
      const { name: d } = this.app, f = `"${d} would like to update"`, o = this.sudoWithArgs(f);
      this._logger.info(`Running as non-root user, using sudo to install: ${o}`);
      let c = '"';
      return (/pkexec/i.test(o[0]) || o[0] === "sudo") && (c = ""), this.spawnSyncLog(o[0], [...o.length > 1 ? o.slice(1) : [], `${c}/bin/bash`, "-c", `'${u.join(" ")}'${c}`]);
    }
    sudoWithArgs(u) {
      const d = this.determineSudoCommand(), f = [d];
      return /kdesudo/i.test(d) ? (f.push("--comment", u), f.push("-c")) : /gksudo/i.test(d) ? f.push("--message", u) : /pkexec/i.test(d) && f.push("--disable-internal-agent"), f;
    }
    hasCommand(u) {
      try {
        return this.spawnSyncLog("command", ["-v", u]), !0;
      } catch {
        return !1;
      }
    }
    determineSudoCommand() {
      const u = ["gksudo", "kdesudo", "pkexec", "beesu"];
      for (const d of u)
        if (this.hasCommand(d))
          return d;
      return "sudo";
    }
    /**
     * Detects the package manager to use based on the available commands.
     * Allows overriding the default behavior by setting the ELECTRON_BUILDER_LINUX_PACKAGE_MANAGER environment variable.
     * If the environment variable is set, it will be used directly. (This is useful for testing each package manager logic path.)
     * Otherwise, it checks for the presence of the specified package manager commands in the order provided.
     * @param pms - An array of package manager commands to check for, in priority order.
     * @returns The detected package manager command or "unknown" if none are found.
     */
    detectPackageManager(u) {
      var d;
      const f = (d = process.env.ELECTRON_BUILDER_LINUX_PACKAGE_MANAGER) === null || d === void 0 ? void 0 : d.trim();
      if (f)
        return f;
      for (const o of u)
        if (this.hasCommand(o))
          return o;
      return this._logger.warn(`No package manager found in the list: ${u.join(", ")}. Defaulting to the first one: ${u[0]}`), u[0];
    }
  };
  return wr.LinuxUpdater = n, wr;
}
var $l;
function Ml() {
  if ($l) return yr;
  $l = 1, Object.defineProperty(yr, "__esModule", { value: !0 }), yr.DebUpdater = void 0;
  const e = Qe(), n = Mt(), h = Fo();
  let u = class Wu extends h.LinuxUpdater {
    constructor(f, o) {
      super(f, o);
    }
    /*** @private */
    doDownloadUpdate(f) {
      const o = f.updateInfoAndProvider.provider, c = (0, e.findFile)(o.resolveFiles(f.updateInfoAndProvider.info), "deb", ["AppImage", "rpm", "pacman"]);
      return this.executeDownload({
        fileExtension: "deb",
        fileInfo: c,
        downloadUpdateOptions: f,
        task: async (a, l) => {
          this.listenerCount(n.DOWNLOAD_PROGRESS) > 0 && (l.onProgress = (s) => this.emit(n.DOWNLOAD_PROGRESS, s)), await this.httpExecutor.download(c.url, a, l);
        }
      });
    }
    doInstall(f) {
      const o = this.installerPath;
      if (o == null)
        return this.dispatchError(new Error("No update filepath provided, can't quit and install")), !1;
      if (!this.hasCommand("dpkg") && !this.hasCommand("apt"))
        return this.dispatchError(new Error("Neither dpkg nor apt command found. Cannot install .deb package.")), !1;
      const c = ["dpkg", "apt"], a = this.detectPackageManager(c);
      try {
        Wu.installWithCommandRunner(a, o, this.runCommandWithSudoIfNeeded.bind(this), this._logger);
      } catch (l) {
        return this.dispatchError(l), !1;
      }
      return f.isForceRunAfter && this.app.relaunch(), !0;
    }
    static installWithCommandRunner(f, o, c, a) {
      var l;
      if (f === "dpkg")
        try {
          c(["dpkg", "-i", o]);
        } catch (s) {
          a.warn((l = s.message) !== null && l !== void 0 ? l : s), a.warn("dpkg installation failed, trying to fix broken dependencies with apt-get"), c(["apt-get", "install", "-f", "-y"]);
        }
      else if (f === "apt")
        a.warn("Using apt to install a local .deb. This may fail for unsigned packages unless properly configured."), c([
          "apt",
          "install",
          "-y",
          "--allow-unauthenticated",
          // needed for unsigned .debs
          "--allow-downgrades",
          // allow lower version installs
          "--allow-change-held-packages",
          o
        ]);
      else
        throw new Error(`Package manager ${f} not supported`);
    }
  };
  return yr.DebUpdater = u, yr;
}
var _r = {}, Bl;
function jl() {
  if (Bl) return _r;
  Bl = 1, Object.defineProperty(_r, "__esModule", { value: !0 }), _r.PacmanUpdater = void 0;
  const e = Mt(), n = Qe(), h = Fo();
  let u = class Vu extends h.LinuxUpdater {
    constructor(f, o) {
      super(f, o);
    }
    /*** @private */
    doDownloadUpdate(f) {
      const o = f.updateInfoAndProvider.provider, c = (0, n.findFile)(o.resolveFiles(f.updateInfoAndProvider.info), "pacman", ["AppImage", "deb", "rpm"]);
      return this.executeDownload({
        fileExtension: "pacman",
        fileInfo: c,
        downloadUpdateOptions: f,
        task: async (a, l) => {
          this.listenerCount(e.DOWNLOAD_PROGRESS) > 0 && (l.onProgress = (s) => this.emit(e.DOWNLOAD_PROGRESS, s)), await this.httpExecutor.download(c.url, a, l);
        }
      });
    }
    doInstall(f) {
      const o = this.installerPath;
      if (o == null)
        return this.dispatchError(new Error("No update filepath provided, can't quit and install")), !1;
      try {
        Vu.installWithCommandRunner(o, this.runCommandWithSudoIfNeeded.bind(this), this._logger);
      } catch (c) {
        return this.dispatchError(c), !1;
      }
      return f.isForceRunAfter && this.app.relaunch(), !0;
    }
    static installWithCommandRunner(f, o, c) {
      var a;
      try {
        o(["pacman", "-U", "--noconfirm", f]);
      } catch (l) {
        c.warn((a = l.message) !== null && a !== void 0 ? a : l), c.warn("pacman installation failed, attempting to update package database and retry");
        try {
          o(["pacman", "-Sy", "--noconfirm"]), o(["pacman", "-U", "--noconfirm", f]);
        } catch (s) {
          throw c.error("Retry after pacman -Sy failed"), s;
        }
      }
    }
  };
  return _r.PacmanUpdater = u, _r;
}
var Tr = {}, Hl;
function Gl() {
  if (Hl) return Tr;
  Hl = 1, Object.defineProperty(Tr, "__esModule", { value: !0 }), Tr.RpmUpdater = void 0;
  const e = Mt(), n = Qe(), h = Fo();
  let u = class Xu extends h.LinuxUpdater {
    constructor(f, o) {
      super(f, o);
    }
    /*** @private */
    doDownloadUpdate(f) {
      const o = f.updateInfoAndProvider.provider, c = (0, n.findFile)(o.resolveFiles(f.updateInfoAndProvider.info), "rpm", ["AppImage", "deb", "pacman"]);
      return this.executeDownload({
        fileExtension: "rpm",
        fileInfo: c,
        downloadUpdateOptions: f,
        task: async (a, l) => {
          this.listenerCount(e.DOWNLOAD_PROGRESS) > 0 && (l.onProgress = (s) => this.emit(e.DOWNLOAD_PROGRESS, s)), await this.httpExecutor.download(c.url, a, l);
        }
      });
    }
    doInstall(f) {
      const o = this.installerPath;
      if (o == null)
        return this.dispatchError(new Error("No update filepath provided, can't quit and install")), !1;
      const c = ["zypper", "dnf", "yum", "rpm"], a = this.detectPackageManager(c);
      try {
        Xu.installWithCommandRunner(a, o, this.runCommandWithSudoIfNeeded.bind(this), this._logger);
      } catch (l) {
        return this.dispatchError(l), !1;
      }
      return f.isForceRunAfter && this.app.relaunch(), !0;
    }
    static installWithCommandRunner(f, o, c, a) {
      if (f === "zypper")
        return c(["zypper", "--non-interactive", "--no-refresh", "install", "--allow-unsigned-rpm", "-f", o]);
      if (f === "dnf")
        return c(["dnf", "install", "--nogpgcheck", "-y", o]);
      if (f === "yum")
        return c(["yum", "install", "--nogpgcheck", "-y", o]);
      if (f === "rpm")
        return a.warn("Installing with rpm only (no dependency resolution)."), c(["rpm", "-Uvh", "--replacepkgs", "--replacefiles", "--nodeps", o]);
      throw new Error(`Package manager ${f} not supported`);
    }
  };
  return Tr.RpmUpdater = u, Tr;
}
var Ar = {}, Wl;
function Vl() {
  if (Wl) return Ar;
  Wl = 1, Object.defineProperty(Ar, "__esModule", { value: !0 }), Ar.MacUpdater = void 0;
  const e = Be(), n = /* @__PURE__ */ _t(), h = yt, u = Le, d = Xc, f = Lo(), o = Qe(), c = Zr, a = Or;
  let l = class extends f.AppUpdater {
    constructor(r, i) {
      super(r, i), this.nativeUpdater = kt.autoUpdater, this.squirrelDownloadedUpdate = !1, this.nativeUpdater.on("error", (p) => {
        this._logger.warn(p), this.emit("error", p);
      }), this.nativeUpdater.on("update-downloaded", () => {
        this.squirrelDownloadedUpdate = !0, this.debug("nativeUpdater.update-downloaded");
      });
    }
    debug(r) {
      this._logger.debug != null && this._logger.debug(r);
    }
    closeServerIfExists() {
      this.server && (this.debug("Closing proxy server"), this.server.close((r) => {
        r && this.debug("proxy server wasn't already open, probably attempted closing again as a safety check before quit");
      }));
    }
    async doDownloadUpdate(r) {
      let i = r.updateInfoAndProvider.provider.resolveFiles(r.updateInfoAndProvider.info);
      const p = this._logger, E = "sysctl.proc_translated";
      let v = !1;
      try {
        this.debug("Checking for macOS Rosetta environment"), v = (0, c.execFileSync)("sysctl", [E], { encoding: "utf8" }).includes(`${E}: 1`), p.info(`Checked for macOS Rosetta environment (isRosetta=${v})`);
      } catch (b) {
        p.warn(`sysctl shell command to check for macOS Rosetta environment failed: ${b}`);
      }
      let m = !1;
      try {
        this.debug("Checking for arm64 in uname");
        const P = (0, c.execFileSync)("uname", ["-a"], { encoding: "utf8" }).includes("ARM");
        p.info(`Checked 'uname -a': arm64=${P}`), m = m || P;
      } catch (b) {
        p.warn(`uname shell command to check for arm64 failed: ${b}`);
      }
      m = m || process.arch === "arm64" || v;
      const _ = (b) => {
        var P;
        return b.url.pathname.includes("arm64") || ((P = b.info.url) === null || P === void 0 ? void 0 : P.includes("arm64"));
      };
      m && i.some(_) ? i = i.filter((b) => m === _(b)) : i = i.filter((b) => !_(b));
      const R = (0, o.findFile)(i, "zip", ["pkg", "dmg"]);
      if (R == null)
        throw (0, e.newError)(`ZIP file not provided: ${(0, e.safeStringifyJson)(i)}`, "ERR_UPDATER_ZIP_FILE_NOT_FOUND");
      const O = r.updateInfoAndProvider.provider, I = "update.zip";
      return this.executeDownload({
        fileExtension: "zip",
        fileInfo: R,
        downloadUpdateOptions: r,
        task: async (b, P) => {
          const C = u.join(this.downloadedUpdateHelper.cacheDir, I), T = () => (0, n.pathExistsSync)(C) ? !r.disableDifferentialDownload : (p.info("Unable to locate previous update.zip for differential download (is this first install?), falling back to full download"), !1);
          let N = !0;
          T() && (N = await this.differentialDownloadInstaller(R, r, b, O, I)), N && await this.httpExecutor.download(R.url, b, P);
        },
        done: async (b) => {
          if (!r.disableDifferentialDownload)
            try {
              const P = u.join(this.downloadedUpdateHelper.cacheDir, I);
              await (0, n.copyFile)(b.downloadedFile, P);
            } catch (P) {
              this._logger.warn(`Unable to copy file for caching for future differential downloads: ${P.message}`);
            }
          return this.updateDownloaded(R, b);
        }
      });
    }
    async updateDownloaded(r, i) {
      var p;
      const E = i.downloadedFile, v = (p = r.info.size) !== null && p !== void 0 ? p : (await (0, n.stat)(E)).size, m = this._logger, _ = `fileToProxy=${r.url.href}`;
      this.closeServerIfExists(), this.debug(`Creating proxy server for native Squirrel.Mac (${_})`), this.server = (0, d.createServer)(), this.debug(`Proxy server for native Squirrel.Mac is created (${_})`), this.server.on("close", () => {
        m.info(`Proxy server for native Squirrel.Mac is closed (${_})`);
      });
      const R = (O) => {
        const I = O.address();
        return typeof I == "string" ? I : `http://127.0.0.1:${I?.port}`;
      };
      return await new Promise((O, I) => {
        const b = (0, a.randomBytes)(64).toString("base64").replace(/\//g, "_").replace(/\+/g, "-"), P = Buffer.from(`autoupdater:${b}`, "ascii"), C = `/${(0, a.randomBytes)(64).toString("hex")}.zip`;
        this.server.on("request", (T, N) => {
          const w = T.url;
          if (m.info(`${w} requested`), w === "/") {
            if (!T.headers.authorization || T.headers.authorization.indexOf("Basic ") === -1) {
              N.statusCode = 401, N.statusMessage = "Invalid Authentication Credentials", N.end(), m.warn("No authenthication info");
              return;
            }
            const M = T.headers.authorization.split(" ")[1], U = Buffer.from(M, "base64").toString("ascii"), [F, H] = U.split(":");
            if (F !== "autoupdater" || H !== b) {
              N.statusCode = 401, N.statusMessage = "Invalid Authentication Credentials", N.end(), m.warn("Invalid authenthication credentials");
              return;
            }
            const L = Buffer.from(`{ "url": "${R(this.server)}${C}" }`);
            N.writeHead(200, { "Content-Type": "application/json", "Content-Length": L.length }), N.end(L);
            return;
          }
          if (!w.startsWith(C)) {
            m.warn(`${w} requested, but not supported`), N.writeHead(404), N.end();
            return;
          }
          m.info(`${C} requested by Squirrel.Mac, pipe ${E}`);
          let q = !1;
          N.on("finish", () => {
            q || (this.nativeUpdater.removeListener("error", I), O([]));
          });
          const k = (0, h.createReadStream)(E);
          k.on("error", (M) => {
            try {
              N.end();
            } catch (U) {
              m.warn(`cannot end response: ${U}`);
            }
            q = !0, this.nativeUpdater.removeListener("error", I), I(new Error(`Cannot pipe "${E}": ${M}`));
          }), N.writeHead(200, {
            "Content-Type": "application/zip",
            "Content-Length": v
          }), k.pipe(N);
        }), this.debug(`Proxy server for native Squirrel.Mac is starting to listen (${_})`), this.server.listen(0, "127.0.0.1", () => {
          this.debug(`Proxy server for native Squirrel.Mac is listening (address=${R(this.server)}, ${_})`), this.nativeUpdater.setFeedURL({
            url: R(this.server),
            headers: {
              "Cache-Control": "no-cache",
              Authorization: `Basic ${P.toString("base64")}`
            }
          }), this.dispatchUpdateDownloaded(i), this.autoInstallOnAppQuit ? (this.nativeUpdater.once("error", I), this.nativeUpdater.checkForUpdates()) : O([]);
        });
      });
    }
    handleUpdateDownloaded() {
      this.autoRunAppAfterInstall ? this.nativeUpdater.quitAndInstall() : this.app.quit(), this.closeServerIfExists();
    }
    quitAndInstall() {
      this.squirrelDownloadedUpdate ? this.handleUpdateDownloaded() : (this.nativeUpdater.on("update-downloaded", () => this.handleUpdateDownloaded()), this.autoInstallOnAppQuit || this.nativeUpdater.checkForUpdates());
    }
  };
  return Ar.MacUpdater = l, Ar;
}
var Rr = {}, Kr = {}, Xl;
function Td() {
  if (Xl) return Kr;
  Xl = 1, Object.defineProperty(Kr, "__esModule", { value: !0 }), Kr.verifySignature = f;
  const e = Be(), n = Zr, h = en, u = Le;
  function d(l, s) {
    return ['set "PSModulePath=" & chcp 65001 >NUL & powershell.exe', ["-NoProfile", "-NonInteractive", "-InputFormat", "None", "-Command", l], {
      shell: !0,
      timeout: s
    }];
  }
  function f(l, s, r) {
    return new Promise((i, p) => {
      const E = s.replace(/'/g, "''");
      r.info(`Verifying signature ${E}`), (0, n.execFile)(...d(`"Get-AuthenticodeSignature -LiteralPath '${E}' | ConvertTo-Json -Compress"`, 20 * 1e3), (v, m, _) => {
        var R;
        try {
          if (v != null || _) {
            c(r, v, _, p), i(null);
            return;
          }
          const O = o(m);
          if (O.Status === 0) {
            try {
              const C = u.normalize(O.Path), T = u.normalize(s);
              if (r.info(`LiteralPath: ${C}. Update Path: ${T}`), C !== T) {
                c(r, new Error(`LiteralPath of ${C} is different than ${T}`), _, p), i(null);
                return;
              }
            } catch (C) {
              r.warn(`Unable to verify LiteralPath of update asset due to missing data.Path. Skipping this step of validation. Message: ${(R = C.message) !== null && R !== void 0 ? R : C.stack}`);
            }
            const b = (0, e.parseDn)(O.SignerCertificate.Subject);
            let P = !1;
            for (const C of l) {
              const T = (0, e.parseDn)(C);
              if (T.size ? P = Array.from(T.keys()).every((w) => T.get(w) === b.get(w)) : C === b.get("CN") && (r.warn(`Signature validated using only CN ${C}. Please add your full Distinguished Name (DN) to publisherNames configuration`), P = !0), P) {
                i(null);
                return;
              }
            }
          }
          const I = `publisherNames: ${l.join(" | ")}, raw info: ` + JSON.stringify(O, (b, P) => b === "RawData" ? void 0 : P, 2);
          r.warn(`Sign verification failed, installer signed with incorrect certificate: ${I}`), i(I);
        } catch (O) {
          c(r, O, null, p), i(null);
          return;
        }
      });
    });
  }
  function o(l) {
    const s = JSON.parse(l);
    delete s.PrivateKey, delete s.IsOSBinary, delete s.SignatureType;
    const r = s.SignerCertificate;
    return r != null && (delete r.Archived, delete r.Extensions, delete r.Handle, delete r.HasPrivateKey, delete r.SubjectName), s;
  }
  function c(l, s, r, i) {
    if (a()) {
      l.warn(`Cannot execute Get-AuthenticodeSignature: ${s || r}. Ignoring signature validation due to unsupported powershell version. Please upgrade to powershell 3 or higher.`);
      return;
    }
    try {
      (0, n.execFileSync)(...d("ConvertTo-Json test", 10 * 1e3));
    } catch (p) {
      l.warn(`Cannot execute ConvertTo-Json: ${p.message}. Ignoring signature validation due to unsupported powershell version. Please upgrade to powershell 3 or higher.`);
      return;
    }
    s != null && i(s), r && i(new Error(`Cannot execute Get-AuthenticodeSignature, stderr: ${r}. Failing signature validation due to unknown stderr.`));
  }
  function a() {
    const l = h.release();
    return l.startsWith("6.") && !l.startsWith("6.3");
  }
  return Kr;
}
var Yl;
function zl() {
  if (Yl) return Rr;
  Yl = 1, Object.defineProperty(Rr, "__esModule", { value: !0 }), Rr.NsisUpdater = void 0;
  const e = Be(), n = Le, h = un(), u = Gu(), d = Mt(), f = Qe(), o = /* @__PURE__ */ _t(), c = Td(), a = wt;
  let l = class extends h.BaseUpdater {
    constructor(r, i) {
      super(r, i), this._verifyUpdateCodeSignature = (p, E) => (0, c.verifySignature)(p, E, this._logger);
    }
    /**
     * The verifyUpdateCodeSignature. You can pass [win-verify-signature](https://github.com/beyondkmp/win-verify-trust) or another custom verify function: ` (publisherName: string[], path: string) => Promise<string | null>`.
     * The default verify function uses [windowsExecutableCodeSignatureVerifier](https://github.com/electron-userland/electron-builder/blob/master/packages/electron-updater/src/windowsExecutableCodeSignatureVerifier.ts)
     */
    get verifyUpdateCodeSignature() {
      return this._verifyUpdateCodeSignature;
    }
    set verifyUpdateCodeSignature(r) {
      r && (this._verifyUpdateCodeSignature = r);
    }
    /*** @private */
    doDownloadUpdate(r) {
      const i = r.updateInfoAndProvider.provider, p = (0, f.findFile)(i.resolveFiles(r.updateInfoAndProvider.info), "exe");
      return this.executeDownload({
        fileExtension: "exe",
        downloadUpdateOptions: r,
        fileInfo: p,
        task: async (E, v, m, _) => {
          const R = p.packageInfo, O = R != null && m != null;
          if (O && r.disableWebInstaller)
            throw (0, e.newError)(`Unable to download new version ${r.updateInfoAndProvider.info.version}. Web Installers are disabled`, "ERR_UPDATER_WEB_INSTALLER_DISABLED");
          !O && !r.disableWebInstaller && this._logger.warn("disableWebInstaller is set to false, you should set it to true if you do not plan on using a web installer. This will default to true in a future version."), (O || r.disableDifferentialDownload || await this.differentialDownloadInstaller(p, r, E, i, e.CURRENT_APP_INSTALLER_FILE_NAME)) && await this.httpExecutor.download(p.url, E, v);
          const I = await this.verifySignature(E);
          if (I != null)
            throw await _(), (0, e.newError)(`New version ${r.updateInfoAndProvider.info.version} is not signed by the application owner: ${I}`, "ERR_UPDATER_INVALID_SIGNATURE");
          if (O && await this.differentialDownloadWebPackage(r, R, m, i))
            try {
              await this.httpExecutor.download(new a.URL(R.path), m, {
                headers: r.requestHeaders,
                cancellationToken: r.cancellationToken,
                sha512: R.sha512
              });
            } catch (b) {
              try {
                await (0, o.unlink)(m);
              } catch {
              }
              throw b;
            }
        }
      });
    }
    // $certificateInfo = (Get-AuthenticodeSignature 'xxx\yyy.exe'
    // | where {$_.Status.Equals([System.Management.Automation.SignatureStatus]::Valid) -and $_.SignerCertificate.Subject.Contains("CN=siemens.com")})
    // | Out-String ; if ($certificateInfo) { exit 0 } else { exit 1 }
    async verifySignature(r) {
      let i;
      try {
        if (i = (await this.configOnDisk.value).publisherName, i == null)
          return null;
      } catch (p) {
        if (p.code === "ENOENT")
          return null;
        throw p;
      }
      return await this._verifyUpdateCodeSignature(Array.isArray(i) ? i : [i], r);
    }
    doInstall(r) {
      const i = this.installerPath;
      if (i == null)
        return this.dispatchError(new Error("No update filepath provided, can't quit and install")), !1;
      const p = ["--updated"];
      r.isSilent && p.push("/S"), r.isForceRunAfter && p.push("--force-run"), this.installDirectory && p.push(`/D=${this.installDirectory}`);
      const E = this.downloadedUpdateHelper == null ? null : this.downloadedUpdateHelper.packageFile;
      E != null && p.push(`--package-file=${E}`);
      const v = () => {
        this.spawnLog(n.join(process.resourcesPath, "elevate.exe"), [i].concat(p)).catch((m) => this.dispatchError(m));
      };
      return r.isAdminRightsRequired ? (this._logger.info("isAdminRightsRequired is set to true, run installer using elevate.exe"), v(), !0) : (this.spawnLog(i, p).catch((m) => {
        const _ = m.code;
        this._logger.info(`Cannot run installer: error code: ${_}, error message: "${m.message}", will be executed again using elevate if EACCES, and will try to use electron.shell.openItem if ENOENT`), _ === "UNKNOWN" || _ === "EACCES" ? v() : _ === "ENOENT" ? kt.shell.openPath(i).catch((R) => this.dispatchError(R)) : this.dispatchError(m);
      }), !0);
    }
    async differentialDownloadWebPackage(r, i, p, E) {
      if (i.blockMapSize == null)
        return !0;
      try {
        const v = {
          newUrl: new a.URL(i.path),
          oldFile: n.join(this.downloadedUpdateHelper.cacheDir, e.CURRENT_APP_PACKAGE_FILE_NAME),
          logger: this._logger,
          newFile: p,
          requestHeaders: this.requestHeaders,
          isUseMultipleRangeRequest: E.isUseMultipleRangeRequest,
          cancellationToken: r.cancellationToken
        };
        this.listenerCount(d.DOWNLOAD_PROGRESS) > 0 && (v.onProgress = (m) => this.emit(d.DOWNLOAD_PROGRESS, m)), await new u.FileWithEmbeddedBlockMapDifferentialDownloader(i, this.httpExecutor, v).download();
      } catch (v) {
        return this._logger.error(`Cannot download differentially, fallback to full download: ${v.stack || v}`), process.platform === "win32";
      }
      return !1;
    }
  };
  return Rr.NsisUpdater = l, Rr;
}
var Kl;
function Ad() {
  return Kl || (Kl = 1, (function(e) {
    var n = Ct && Ct.__createBinding || (Object.create ? (function(m, _, R, O) {
      O === void 0 && (O = R);
      var I = Object.getOwnPropertyDescriptor(_, R);
      (!I || ("get" in I ? !_.__esModule : I.writable || I.configurable)) && (I = { enumerable: !0, get: function() {
        return _[R];
      } }), Object.defineProperty(m, O, I);
    }) : (function(m, _, R, O) {
      O === void 0 && (O = R), m[O] = _[R];
    })), h = Ct && Ct.__exportStar || function(m, _) {
      for (var R in m) R !== "default" && !Object.prototype.hasOwnProperty.call(_, R) && n(_, m, R);
    };
    Object.defineProperty(e, "__esModule", { value: !0 }), e.NsisUpdater = e.MacUpdater = e.RpmUpdater = e.PacmanUpdater = e.DebUpdater = e.AppImageUpdater = e.Provider = e.NoOpLogger = e.AppUpdater = e.BaseUpdater = void 0;
    const u = /* @__PURE__ */ _t(), d = Le;
    var f = un();
    Object.defineProperty(e, "BaseUpdater", { enumerable: !0, get: function() {
      return f.BaseUpdater;
    } });
    var o = Lo();
    Object.defineProperty(e, "AppUpdater", { enumerable: !0, get: function() {
      return o.AppUpdater;
    } }), Object.defineProperty(e, "NoOpLogger", { enumerable: !0, get: function() {
      return o.NoOpLogger;
    } });
    var c = Qe();
    Object.defineProperty(e, "Provider", { enumerable: !0, get: function() {
      return c.Provider;
    } });
    var a = kl();
    Object.defineProperty(e, "AppImageUpdater", { enumerable: !0, get: function() {
      return a.AppImageUpdater;
    } });
    var l = Ml();
    Object.defineProperty(e, "DebUpdater", { enumerable: !0, get: function() {
      return l.DebUpdater;
    } });
    var s = jl();
    Object.defineProperty(e, "PacmanUpdater", { enumerable: !0, get: function() {
      return s.PacmanUpdater;
    } });
    var r = Gl();
    Object.defineProperty(e, "RpmUpdater", { enumerable: !0, get: function() {
      return r.RpmUpdater;
    } });
    var i = Vl();
    Object.defineProperty(e, "MacUpdater", { enumerable: !0, get: function() {
      return i.MacUpdater;
    } });
    var p = zl();
    Object.defineProperty(e, "NsisUpdater", { enumerable: !0, get: function() {
      return p.NsisUpdater;
    } }), h(Mt(), e);
    let E;
    function v() {
      if (process.platform === "win32")
        E = new (zl()).NsisUpdater();
      else if (process.platform === "darwin")
        E = new (Vl()).MacUpdater();
      else {
        E = new (kl()).AppImageUpdater();
        try {
          const m = d.join(process.resourcesPath, "package-type");
          if (!(0, u.existsSync)(m))
            return E;
          switch ((0, u.readFileSync)(m).toString().trim()) {
            case "deb":
              E = new (Ml()).DebUpdater();
              break;
            case "rpm":
              E = new (Gl()).RpmUpdater();
              break;
            case "pacman":
              E = new (jl()).PacmanUpdater();
              break;
            default:
              break;
          }
        } catch (m) {
          console.warn("Unable to detect 'package-type' for autoUpdater (rpm/deb/pacman support). If you'd like to expand support, please consider contributing to electron-builder", m.message);
        }
      }
      return E;
    }
    Object.defineProperty(e, "autoUpdater", {
      enumerable: !0,
      get: () => E || v()
    });
  })(Ct)), Ct;
}
var lt = Ad();
const Rd = Yc, bd = [
  {
    version: 1,
    description: "create_provider_configs_and_enable_wal",
    sql: `PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS provider_configs (
    id TEXT PRIMARY KEY NOT NULL,
    api_url TEXT,
    api_key TEXT,
    model TEXT,
    is_active INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);`
  },
  {
    version: 2,
    description: "create_grading_sessions",
    sql: `CREATE TABLE IF NOT EXISTS grading_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider_id TEXT,
    model TEXT,
    student_count INTEGER,
    mean_score REAL,
    min_score REAL,
    max_score REAL,
    median_score REAL,
    max_possible_score REAL,
    page_url TEXT,
    question_id TEXT,
    custom_instructions TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);`
  },
  {
    version: 3,
    description: "create_app_settings_with_defaults",
    sql: `CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT
);
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('setup_complete', 'false');
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('history_visible_columns', '["timestamp","provider","model","studentCount","meanScore","pageUrl"]');`
  },
  {
    version: 4,
    description: "create_oauth_tokens",
    sql: `CREATE TABLE IF NOT EXISTS oauth_tokens (
    provider TEXT PRIMARY KEY NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    token_type TEXT,
    expires_at INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);`
  },
  {
    version: 5,
    description: "create_site_credentials",
    sql: `CREATE TABLE IF NOT EXISTS site_credentials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    site_name TEXT NOT NULL,
    url_pattern TEXT NOT NULL,
    username TEXT NOT NULL,
    password TEXT NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);`
  },
  {
    version: 6,
    description: "create_site_profiles",
    sql: `CREATE TABLE IF NOT EXISTS site_profiles (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    url_patterns TEXT NOT NULL,
    selectors TEXT NOT NULL,
    feedback TEXT NOT NULL,
    save TEXT NOT NULL,
    navigation TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);`
  },
  {
    version: 7,
    description: "create_batch_session",
    sql: `CREATE TABLE IF NOT EXISTS batch_session (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    last_student_name TEXT NOT NULL,
    timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_batch_session_url ON batch_session(url);`
  },
  {
    version: 8,
    description: "create_skills",
    sql: `CREATE TABLE IF NOT EXISTS skills (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    source TEXT,
    source_id TEXT,
    is_active INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_skills_source ON skills(source, source_id) WHERE source IS NOT NULL;`
  },
  {
    version: 9,
    description: "add_url_pattern_to_skills",
    sql: "ALTER TABLE skills ADD COLUMN url_pattern TEXT;"
  },
  {
    version: 10,
    description: "create_response_embeddings_table",
    sql: `CREATE TABLE IF NOT EXISTS response_embeddings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER REFERENCES grading_sessions(id),
    rubric_hash TEXT NOT NULL,
    student_response TEXT,
    score REAL NOT NULL,
    feedback TEXT,
    embedding BLOB NOT NULL,
    embedding_model TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_embeddings_rubric_hash ON response_embeddings(rubric_hash);
CREATE INDEX IF NOT EXISTS idx_embeddings_model ON response_embeddings(embedding_model);`
  },
  {
    version: 11,
    description: "add_extraction_column_to_site_profiles",
    sql: "ALTER TABLE site_profiles ADD COLUMN extraction TEXT DEFAULT NULL;"
  },
  {
    version: 12,
    description: "add_learned_corrections_to_skills",
    sql: "ALTER TABLE skills ADD COLUMN learned_corrections TEXT DEFAULT NULL;"
  }
];
let Jr = null;
const Sd = [
  /\bDROP\b/i,
  /\bCREATE\b/i,
  /\bALTER\b/i,
  /\bATTACH\b/i,
  /\bDETACH\b/i,
  /\bPRAGMA\b/i,
  /\bVACUUM\b/i,
  /\bREINDEX\b/i,
  /\bANALYZE\b/i,
  /--/,
  // inline comment (SQL injection marker)
  /\/\*/
  // block comment
];
function Jl(e) {
  for (const n of Sd)
    if (n.test(e))
      throw new Error(`Blocked SQL pattern: ${n}`);
}
function Cd(e) {
  return e.replace(/\$(\d+)/g, "?$1");
}
function Od(e) {
  return /\?[1-9]\d*/.test(e);
}
function Ql(e, n) {
  const h = Cd(e);
  if (!Od(h))
    return { normalizedSql: h, bindings: n };
  const u = {};
  for (const [d, f] of n.entries())
    u[d + 1] = f;
  return { normalizedSql: h, bindings: u };
}
function Nd(e, n) {
  return Array.isArray(n) ? e.all(...n) : e.all(n);
}
function Pd(e, n) {
  return Array.isArray(n) ? e.run(...n) : e.run(n);
}
function Zl(e) {
  return e instanceof Uint8Array ? Buffer.from(e.buffer, e.byteOffset, e.byteLength) : e;
}
function po(e) {
  return Buffer.isBuffer(e) ? Array.from(e) : Array.isArray(e) ? e.map(po) : e && typeof e == "object" ? Object.fromEntries(
    Object.entries(e).map(([n, h]) => [
      n,
      po(h)
    ])
  ) : e;
}
function Dd(e) {
  return (e instanceof Error ? e.message.toLowerCase() : String(e).toLowerCase()).includes("duplicate column name");
}
function Id() {
  return qe.join(Me.getPath("userData"), "ogre.db");
}
function Ld(e) {
  e.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    version INTEGER PRIMARY KEY,
    description TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`);
  const n = new Set(
    e.prepare("SELECT version FROM _migrations ORDER BY version").all().map(
      (u) => u.version
    )
  ), h = e.prepare(
    "INSERT OR IGNORE INTO _migrations (version, description) VALUES (?, ?)"
  );
  for (const u of bd)
    if (!n.has(u.version)) {
      try {
        e.exec(u.sql);
      } catch (d) {
        if (!Dd(d))
          throw d;
      }
      h.run(u.version, u.description);
    }
}
function mo() {
  return Jr || (Jr = new Rd(Id()), Ld(Jr)), Jr;
}
function Fd() {
  be.removeHandler("db_query"), be.removeHandler("db_execute"), be.handle("db_query", (e, n) => {
    Jl(n.sql);
    const h = mo(), u = (n.params ?? []).map(Zl), { normalizedSql: d, bindings: f } = Ql(n.sql, u), o = h.prepare(d), c = Nd(o, f);
    return po(c);
  }), be.handle("db_execute", (e, n) => {
    Jl(n.sql);
    const h = mo(), u = (n.params ?? []).map(Zl), { normalizedSql: d, bindings: f } = Ql(n.sql, u), o = h.prepare(d), c = Pd(o, f);
    return {
      rowsAffected: c.changes,
      lastInsertId: Number(c.lastInsertRowid ?? 0)
    };
  });
}
const ot = /* @__PURE__ */ new Map();
function Uo() {
  return zt.getAllWindows()[0] ?? null;
}
function Dt(e, n) {
  const h = Uo();
  h && !h.isDestroyed() && h.webContents.send(e, n);
}
function Zt(e) {
  const n = ot.get(e);
  if (!n) throw new Error(`Tab ${e} not found`);
  return n;
}
function go(e) {
  const n = e.trim();
  return n.startsWith("http://") || n.startsWith("https://") ? n : "https://" + n;
}
function Ud(e, n) {
  const h = Uo();
  if (!h) {
    Dt("browser-status", "error");
    return;
  }
  ot.has(e) && Yu(e);
  const u = new Gc({
    webPreferences: {
      contextIsolation: !0,
      nodeIntegration: !1,
      sandbox: !1
    }
  });
  h.contentView.addChildView(u);
  const d = go(n);
  u.webContents.on("did-navigate", (f, o) => {
    const c = ot.get(e);
    c && (c.url = o), Dt("browser-url-changed", { tabId: e, url: o });
  }), u.webContents.on("did-finish-load", () => {
    const f = u.webContents.getURL(), o = ot.get(e);
    o && (o.url = f), Dt("browser-page-loaded", { tabId: e, url: f });
  }), u.webContents.on("will-navigate", (f, o) => {
    Dt("browser-url-changed", { tabId: e, url: o });
  }), u.webContents.setWindowOpenHandler(({ url: f }) => (u.webContents.loadURL(go(f)).catch(() => {
  }), { action: "deny" })), ot.set(e, { view: u, url: d, visible: !0 }), u.webContents.loadURL(d).then(() => {
    Dt("browser-status", "embedded-open");
  }).catch((f) => {
    Dt("browser-status", "error"), Dt("browser-log", `Load failed: ${f.message}`);
  });
}
function xd(e, n) {
  const h = Zt(e), u = go(n);
  h.view.webContents.loadURL(u).catch(() => {
  });
}
function kd(e) {
  Zt(e).view.webContents.goBack();
}
function qd(e) {
  Zt(e).view.webContents.goForward();
}
function $d(e) {
  Zt(e).view.webContents.reload();
}
function Md(e, n, h, u, d) {
  Zt(e).view.setBounds({ x: Math.round(n), y: Math.round(h), width: Math.round(u), height: Math.round(d) });
}
function Bd(e) {
  const n = ot.get(e);
  n && (n.view.setVisible(!1), n.visible = !1);
}
function jd() {
  for (const [, e] of ot)
    e.view.setVisible(!1), e.visible = !1;
}
function Hd(e) {
  const n = Zt(e);
  n.view.setVisible(!0), n.visible = !0;
}
function Gd(e) {
  const n = ot.get(e);
  return n ? n.view.webContents.getURL() || n.url : "";
}
function Yu(e) {
  const n = ot.get(e);
  if (!n) return;
  const h = Uo();
  if (h && !h.isDestroyed())
    try {
      h.contentView.removeChildView(n.view);
    } catch {
    }
  try {
    n.view.webContents.close();
  } catch {
  }
  ot.delete(e);
}
function Ut(e) {
  return ot.get(e)?.view.webContents ?? null;
}
function Wd() {
  be.handle("create_embedded_browser", (e, { tabId: n, url: h }) => {
    Ud(n, h);
  }), be.handle("navigate_embedded", (e, { tabId: n, url: h }) => {
    xd(n, h);
  }), be.handle("go_back", (e, { tabId: n }) => {
    kd(n);
  }), be.handle("go_forward", (e, { tabId: n }) => {
    qd(n);
  }), be.handle("reload_browser", (e, { tabId: n }) => {
    $d(n);
  }), be.handle("set_webview_bounds", (e, { tabId: n, x: h, y: u, width: d, height: f }) => {
    Md(n, h, u, d, f);
  }), be.handle("hide_webview", (e, { tabId: n }) => {
    Bd(n);
  }), be.handle("hide_all_webviews", () => {
    jd();
  }), be.handle("show_webview", (e, { tabId: n }) => {
    Hd(n);
  }), be.handle("get_embedded_url", (e, { tabId: n }) => Gd(n)), be.handle("destroy_webview", (e, { tabId: n }) => {
    Yu(n);
  }), be.handle("inject_autofill", (e, { tabId: n, script: h }) => {
    const u = Ut(n);
    if (u) return u.executeJavaScript(h, !0);
  }), be.handle("eval_webview_script", (e, { tabId: n, script: h }) => {
    const u = Ut(n);
    if (!u) throw new Error(`Tab ${n} not found`);
    return u.executeJavaScript(h, !0);
  }), be.handle("inject_webview_script", (e, { tabId: n, script: h }) => {
    const u = Ut(n);
    if (!u) throw new Error(`Tab ${n} not found`);
    return u.executeJavaScript(h, !1);
  });
}
const eu = qe.join(Ft.homedir(), ".ogre", "cdp-port");
let zu = null;
function Vd(e) {
  zu = e;
  try {
    Lt.mkdirSync(qe.dirname(eu), { recursive: !0 }), Lt.writeFileSync(eu, String(e));
  } catch {
  }
}
const xt = /* @__PURE__ */ new Set();
function Eo(e) {
  const n = Ut(e);
  if (!(!n || xt.has(e))) {
    try {
      n.debugger.attach("1.3"), xt.add(e), n.debugger.sendCommand("Page.enable").catch(() => {
      }), n.debugger.sendCommand("Runtime.enable").catch(() => {
      }), n.debugger.sendCommand("DOM.enable").catch(() => {
      }), n.debugger.sendCommand("Accessibility.enable").catch(() => {
      });
    } catch {
    }
    n.debugger.on("message", (h, u, d) => {
      const f = zt.fromWebContents(n);
      f && !f.isDestroyed() && f.webContents.send("cdp-event", { tabId: e, method: u, params: d });
    }), n.on("destroyed", () => {
      xt.delete(e);
    });
  }
}
function Xd(e) {
  const n = Ut(e);
  if (!(!n || !xt.has(e))) {
    try {
      n.debugger.detach();
    } catch {
    }
    xt.delete(e);
  }
}
function Yd(e) {
  if (!e || e.length === 0) return "";
  const n = /* @__PURE__ */ new Map();
  for (const c of e) n.set(c.nodeId, c);
  const h = e.filter((c) => {
    const a = c.role?.value ?? "";
    return a === "WebArea" || a === "RootWebArea";
  }), u = h.length > 0 ? h : e.slice(0, 1), d = /* @__PURE__ */ new Set(["none", "presentation", "InlineTextBox"]), f = [];
  function o(c, a) {
    const l = c.role?.value ?? "unknown";
    if (d.has(l)) {
      for (const E of c.childIds ?? []) {
        const v = n.get(E);
        v && o(v, a);
      }
      return;
    }
    const s = c.name?.value ? ` "${String(c.name.value).trim()}"` : "", r = c.value?.value !== void 0 ? ` value="${String(c.value.value)}"` : "", i = "  ".repeat(a), p = c.backendDOMNodeId ? ` [DOM=${c.backendDOMNodeId}]` : "";
    f.push(`${i}- ${l}${s}${r}${p}`);
    for (const E of c.childIds ?? []) {
      const v = n.get(E);
      v && o(v, a + 1);
    }
  }
  for (const c of u) o(c, 0);
  return f.join(`
`);
}
async function zd(e) {
  const n = Ut(e);
  if (!n) throw new Error(`Tab ${e} not found`);
  xt.has(e) || Eo(e), await n.debugger.sendCommand("Accessibility.enable");
  const h = await n.debugger.sendCommand("Accessibility.getFullAXTree");
  return Yd(h.nodes ?? []);
}
const Kd = /* @__PURE__ */ new Set([
  "Page.captureScreenshot",
  "Page.enable",
  "Page.navigate",
  "Page.reload",
  "Page.getFrameTree",
  "Runtime.evaluate",
  "Runtime.callFunctionOn",
  "Runtime.enable",
  "Runtime.getProperties",
  "DOM.enable",
  "DOM.getDocument",
  "DOM.querySelector",
  "DOM.querySelectorAll",
  "DOM.getBoxModel",
  "DOM.scrollIntoViewIfNeeded",
  "DOM.setAttributeValue",
  "Input.dispatchMouseEvent",
  "Input.dispatchKeyEvent",
  "Input.insertText",
  "Accessibility.enable",
  "Accessibility.getFullAXTree",
  "Accessibility.getAXNodeAndAncestors",
  "Network.enable",
  "Network.getCookies",
  "Network.deleteCookies"
]);
function Jd() {
  be.handle("cdp_attach", (e, { tabId: n }) => {
    Eo(n);
  }), be.handle("cdp_detach", (e, { tabId: n }) => {
    Xd(n);
  }), be.handle("cdp_send", async (e, { tabId: n, method: h, params: u }) => {
    if (!Kd.has(h))
      throw new Error(`CDP method not allowed: ${h}`);
    const d = Ut(n);
    if (!d) throw new Error(`Tab ${n} not found`);
    return xt.has(n) || Eo(n), d.debugger.sendCommand(h, u);
  }), be.handle("capture_accessibility_tree", async (e, { tabId: n }) => zd(n)), be.handle("get_cdp_port", () => zu), be.handle("discover_cdp_target", async (e, { port: n }) => {
    try {
      const h = new AbortController(), u = setTimeout(() => h.abort(), 3e3), d = await fetch(`http://127.0.0.1:${n}/json`, { signal: h.signal });
      if (clearTimeout(u), !d.ok) return null;
      const f = await d.json(), o = [
        /^devtools:\/\//,
        /^chrome-extension:\/\//,
        /^http:\/\/localhost:(1420|5173)/,
        /^file:\/\//
      ];
      return f.find(
        (a) => a.type === "page" && a.url !== "about:blank" && a.url !== "" && !o.some((l) => l.test(a.url))
      )?.webSocketDebuggerUrl ?? null;
    } catch {
      return null;
    }
  });
}
let fo = null;
function Qd(e) {
  const n = {}, h = e.match(/^GET ([^\s]+)/);
  if (!h) return n;
  const u = h[1].indexOf("?");
  if (u === -1) return n;
  const d = h[1].slice(u + 1);
  for (const f of d.split("&")) {
    const [o, c] = f.split("=");
    o && (n[decodeURIComponent(o)] = c ? decodeURIComponent(c.replace(/\+/g, " ")) : "");
  }
  return n;
}
function tu(e, n, h) {
  const u = `<!DOCTYPE html><html><head><title>${n}</title></head><body><h1>${n}</h1><p>${h}</p><script>window.close();<\/script></body></html>`, d = [
    "HTTP/1.1 200 OK",
    "Content-Type: text/html; charset=utf-8",
    `Content-Length: ${Buffer.byteLength(u)}`,
    "Connection: close",
    "",
    u
  ].join(`\r
`);
  e.write(d), e.end();
}
function Zd() {
  be.handle("start_oauth_callback_server", async (e, { port: n }) => new Promise((h) => {
    const u = zc.createServer();
    let d = !1;
    function f(r) {
      d || (d = !0, fo = null, u.close(), h(r));
    }
    fo = () => f({ code: null, state: null, error: "OAuth cancelled", port: l });
    const c = setTimeout(() => f({ code: null, state: null, error: "OAuth timeout (5 minutes)", port: l }), 3e5);
    u.on("connection", (r) => {
      let i = "";
      r.on("data", (p) => {
        if (i += p.toString(), i.includes(`\r
\r
`) || i.includes(`

`)) {
          clearTimeout(c);
          const E = Qd(i);
          E.error ? (tu(r, "Authorization Failed", `Error: ${E.error}`), f({ code: null, state: null, error: E.error, port: l })) : (tu(r, "Authorization Complete", "You may close this window and return to O.G.R.E."), f({ code: E.code ?? null, state: E.state ?? null, error: null, port: l }));
        }
      }), r.on("error", () => {
      });
    }), u.on("error", (r) => {
      clearTimeout(c), f({ code: null, state: null, error: r.message, port: l });
    });
    let a = n, l = n;
    const s = () => {
      u.listen(a, "127.0.0.1", () => {
        l = u.address().port;
      });
    };
    u.once("error", (r) => {
      (r.code === "EADDRINUSE" || r.code === "EACCES") && a < n + 20 && (a++, u.close(() => s()));
    }), s();
  })), be.handle("stop_oauth_callback_server", () => {
    fo?.();
  });
}
function eh() {
  Fd(), Wd(), Jd(), Zd(), be.handle("oauth:fetch", async (e, {
    url: n,
    method: h = "POST",
    headers: u = {},
    body: d
  }) => {
    const f = await Wc.fetch(n, {
      method: h,
      headers: u,
      body: d ?? void 0
    }), o = await f.text();
    return { ok: f.ok, status: f.status, body: o };
  }), be.handle("scan_local_skills", async (e, { dir: n }) => {
    try {
      return Lt.readdirSync(n, { withFileTypes: !0 }).filter((u) => u.isDirectory()).map((u) => {
        const d = qe.join(n, u.name, "SKILL.md"), f = Lt.existsSync(d) ? Lt.readFileSync(d, "utf-8") : "";
        return { name: u.name, path: qe.join(n, u.name), content: f };
      });
    } catch {
      return [];
    }
  }), be.handle("updater:check", async () => {
    try {
      return await lt.autoUpdater.checkForUpdates();
    } catch {
      return null;
    }
  }), be.handle("updater:download", async () => {
    try {
      return await lt.autoUpdater.downloadUpdate();
    } catch {
      return null;
    }
  }), be.handle("updater:install", () => {
    lt.autoUpdater.quitAndInstall();
  });
}
const th = lu(import.meta.url), ru = qe.dirname(th), ho = 3;
let ut = null, br = 0, vo = !1;
function rh() {
  const e = [
    qe.join(process.resourcesPath ?? "", "server-bundle", "server.js"),
    qe.join(ru, "..", "..", "src-tauri", "binaries", "server-bundle", "server.js"),
    qe.join(ru, "..", "..", "grading-server", "server.js")
  ];
  for (const n of e)
    if (Lt.existsSync(n)) return qe.dirname(n);
  throw new Error(`server.js not found. Tried: ${e.join(", ")}`);
}
function nh() {
  const e = process.platform === "win32", n = [
    qe.join(Ft.homedir(), ".bun", "bin", e ? "bun.exe" : "bun"),
    ...e ? [
      qe.join(Ft.homedir(), "AppData", "Roaming", "npm", "bun.cmd"),
      qe.join(Ft.homedir(), "AppData", "Local", ".bun", "bin", "bun.exe")
    ] : ["/opt/homebrew/bin/bun", "/usr/local/bin/bun"],
    "bun"
  ];
  for (const h of n) {
    if (h === "bun") return "bun";
    if (Lt.existsSync(h)) return h;
  }
  return "bun";
}
function nt(e, n) {
  for (const h of zt.getAllWindows())
    h.isDestroyed() || h.webContents.send(e, n);
}
function ih(e) {
  try {
    const n = JSON.parse(e);
    if (n.type === "session_complete") return { type: "session-complete", data: n };
    if (n.type === "provider_changed")
      return {
        type: "provider-changed",
        data: { provider_id: n.provider_id, model: n.model }
      };
  } catch {
  }
  return null;
}
function Ku() {
  if (vo) return;
  let e;
  try {
    e = rh();
  } catch (c) {
    const a = c instanceof Error ? c.message : String(c);
    nt("server-log", `[error] ${a}`), nt("server-status", "failed");
    return;
  }
  const n = nh(), h = Me.getPath("userData"), d = [...[
    qe.join(Ft.homedir(), ".bun", "bin"),
    ...process.platform === "win32" ? [
      qe.join(Ft.homedir(), "AppData", "Roaming", "npm"),
      qe.join(Ft.homedir(), "AppData", "Local", ".bun", "bin")
    ] : ["/opt/homebrew/bin", "/usr/local/bin"]
  ], process.env.PATH ?? ""].join(qe.delimiter);
  ut = Kc(n, ["run", qe.join(e, "server.js")], {
    cwd: e,
    env: { ...process.env, PATH: d, OGRE_CONFIG_DIR: h },
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32"
  }), nt("server-status", "running"), br = 0, Xo({ input: ut.stdout }).on("line", (c) => {
    nt("server-log", c);
    const a = ih(c);
    a && nt(a.type, a.data);
  }), Xo({ input: ut.stderr }).on("line", (c) => {
    nt("server-log", `[stderr] ${c}`);
  }), ut.on("exit", (c) => {
    if (ut = null, vo || c === 0) {
      nt("server-status", "stopped");
      return;
    }
    if (nt("server-status", "crashed"), br++, br <= ho) {
      const a = Math.pow(2, br - 1);
      nt(
        "server-log",
        `Restarting grading-server (attempt ${br}/${ho}) in ${a}s...`
      ), setTimeout(() => Ku(), a * 1e3);
    } else
      nt("server-status", "failed"), nt(
        "server-log",
        `grading-server failed after ${ho} restart attempts`
      );
  });
}
function oh() {
  if (vo = !0, !ut) return;
  ut.kill("SIGTERM");
  const e = setTimeout(() => {
    ut && ut.kill("SIGKILL");
  }, 5e3);
  ut.once("exit", () => clearTimeout(e));
}
let nu = !1, Qr = null;
function It(e) {
  !Qr || Qr.isDestroyed() || Qr.webContents.send("update-status", e);
}
function iu(e) {
  if (e) {
    if (typeof e == "string") return e;
    if (Array.isArray(e))
      return e.map((n) => {
        if (!n || typeof n != "object") return "";
        const h = n, u = typeof h.note == "string" ? h.note : "", d = typeof h.version == "string" ? h.version : "";
        return d && u ? `v${d}
${u}` : u;
      }).filter(Boolean).join(`

`);
  }
}
function ou(e) {
  if (Qr = e, !nu) {
    nu = !0, lt.autoUpdater.autoDownload = !1, lt.autoUpdater.on("update-available", (n) => {
      It({
        type: "update-available",
        version: n.version,
        notes: iu(n.releaseNotes)
      });
    }), lt.autoUpdater.on("update-not-available", (n) => {
      It({
        type: "update-not-available",
        version: n.version
      });
    }), lt.autoUpdater.on("download-progress", (n) => {
      It({
        type: "update-progress",
        percent: n.percent,
        transferred: n.transferred,
        total: n.total,
        bytesPerSecond: n.bytesPerSecond
      });
    }), lt.autoUpdater.on("update-downloaded", (n) => {
      It({
        type: "update-ready",
        version: n.version,
        notes: iu(n.releaseNotes)
      });
    }), lt.autoUpdater.on("error", (n) => {
      It({
        type: "error",
        message: n?.message ?? "Unknown updater error"
      });
    });
    try {
      lt.autoUpdater.checkForUpdates().catch((n) => {
        const h = n instanceof Error ? n.message : String(n);
        It({
          type: "error",
          message: h
        });
      });
    } catch (n) {
      const h = n instanceof Error ? n.message : String(n);
      It({
        type: "error",
        message: h
      });
    }
  }
}
const au = qe.dirname(lu(import.meta.url));
process.platform === "linux" && (Me.disableHardwareAcceleration(), Me.commandLine.appendSwitch("disable-gpu"), Me.commandLine.appendSwitch("disable-software-rasterizer"), Me.commandLine.appendSwitch("no-sandbox"), Me.commandLine.appendSwitch("disable-dev-shm-usage"), (process.env.XDG_SESSION_TYPE === "wayland" || process.env.WAYLAND_DISPLAY) && Me.commandLine.appendSwitch("ozone-platform", "wayland"));
Me.commandLine.appendSwitch("remote-debugging-port", "9223");
Me.commandLine.appendSwitch("remote-allow-origins", "*");
const ah = process.env.NODE_ENV === "development" || !Me.isPackaged;
function su() {
  const e = new zt({
    width: 1280,
    height: 900,
    title: "O.G.R.E - Grading Server Manager",
    webPreferences: {
      contextIsolation: !0,
      nodeIntegration: !1,
      sandbox: !0,
      preload: qe.join(au, "preload.cjs")
    }
  });
  return process.env.VITE_DEV_SERVER_URL ? e.loadURL(process.env.VITE_DEV_SERVER_URL) : ah ? e.loadURL("http://localhost:5173") : e.loadFile(qe.join(au, "..", "dist", "index.html")), e;
}
process.on("message", (e) => {
  if (e === "electron-vite&type=hot-reload")
    for (const n of zt.getAllWindows())
      n.webContents.reload();
});
Me.whenReady().then(() => {
  mo(), eh(), Vd(9223), Ku();
  const e = su();
  Me.isPackaged && ou(e), Me.on("activate", () => {
    if (zt.getAllWindows().length === 0) {
      const n = su();
      Me.isPackaged && ou(n);
    }
  });
});
Me.on("before-quit", () => {
  oh();
});
Me.on("window-all-closed", () => {
  process.platform !== "darwin" && Me.quit();
});
