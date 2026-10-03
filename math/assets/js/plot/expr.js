/* expr.js — 自研数学表达式解析器（词法 → 语法 → 编译为闭包 AST）
   支持：四则运算、^ 幂、隐式乘法 2x / 3sin(x) / (x+1)(x-1)、比较与条件 ?:
   函数：sin cos tan asin acos atan atan2 sinh cosh tanh asinh acosh atanh
        ln log log2 log10 exp sqrt cbrt abs sign floor ceil round trunc
        min max pow mod hypot clamp step sinc gamma fact nthroot
   常数：pi e tau phi inf
   变量：x y t theta r a b c k m n 等任意标识符（由外部 scope 提供） */

export const CONSTANTS = {
  pi: Math.PI, PI: Math.PI, 'π': Math.PI,
  e: Math.E, E: Math.E,
  tau: Math.PI * 2, 'τ': Math.PI * 2,
  phi: (1 + Math.sqrt(5)) / 2,
  inf: Infinity, infinity: Infinity
};

export const FUNCTIONS = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan, atan2: Math.atan2,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  asinh: Math.asinh, acosh: Math.acosh, atanh: Math.atanh,
  exp: Math.exp,
  ln: Math.log,
  log2: Math.log2, log10: Math.log10,
  log: (a, b) => (b === undefined ? Math.log(a) : Math.log(b) / Math.log(a)),
  sqrt: Math.sqrt,
  cbrt: Math.cbrt,
  abs: Math.abs,
  sign: Math.sign,
  floor: Math.floor, ceil: Math.ceil, round: Math.round, trunc: Math.trunc,
  min: Math.min, max: Math.max,
  pow: Math.pow,
  mod: (a, b) => a - b * Math.floor(a / b),
  hypot: Math.hypot,
  clamp: (v, lo, hi) => Math.min(Math.max(v, lo), hi),
  step: (edge, v) => (v < edge ? 0 : 1),
  sinc: (v) => (v === 0 ? 1 : Math.sin(v) / v),
  gamma: gammaFn,
  fact: (n) => gammaFn(n + 1),
  nthroot: (n, v) => (v < 0 && Math.abs(n % 2) === 1 ? -Math.pow(-v, 1 / n) : Math.pow(v, 1 / n)),
  random: Math.random,
  degrees: (v) => (v * 180) / Math.PI,
  radians: (v) => (v * Math.PI) / 180
};

export const FUNCTION_NAMES = Object.keys(FUNCTIONS);

function gammaFn(z) {
  if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gammaFn(1 - z));
  z -= 1;
  const g = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  let x = g[0];
  for (let i = 1; i < g.length; i++) x += g[i] / (z + i);
  const tt = z + g.length - 1.5;
  return Math.sqrt(2 * Math.PI) * Math.pow(tt, z + 0.5) * Math.exp(-tt) * x;
}

/* ------------------------------ 词法分析 ------------------------------ */
const T = { NUM: 'num', IDENT: 'ident', OP: 'op', LP: '(', RP: ')', COMMA: ',', END: 'end' };

export function tokenize(src) {
  const tokens = [];
  let i = 0;
  const isDigit = (c) => c >= '0' && c <= '9';
  const isIdStart = (c) => /[A-Za-z_\u0370-\u03ff]/.test(c);
  const isIdPart = (c) => /[A-Za-z0-9_\u0370-\u03ff]/.test(c);

  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
    if (isDigit(c) || (c === '.' && isDigit(src[i + 1]))) {
      let j = i;
      while (j < src.length && isDigit(src[j])) j++;
      if (src[j] === '.') { j++; while (j < src.length && isDigit(src[j])) j++; }
      if (src[j] === 'e' || src[j] === 'E') {
        let k = j + 1;
        if (src[k] === '+' || src[k] === '-') k++;
        if (isDigit(src[k])) { k++; while (k < src.length && isDigit(src[k])) k++; j = k; }
      }
      tokens.push({ t: T.NUM, v: parseFloat(src.slice(i, j)), pos: i });
      i = j;
      continue;
    }
    if (isIdStart(c)) {
      let j = i;
      while (j < src.length && isIdPart(src[j])) j++;
      tokens.push({ t: T.IDENT, v: src.slice(i, j), pos: i });
      i = j;
      continue;
    }
    if (c === '(') { tokens.push({ t: T.LP, v: c, pos: i }); i++; continue; }
    if (c === ')') { tokens.push({ t: T.RP, v: c, pos: i }); i++; continue; }
    if (c === ',' || c === '，') { tokens.push({ t: T.COMMA, v: ',', pos: i }); i++; continue; }
    if (c === ':' || c === '：') { tokens.push({ t: T.OP, v: ':', pos: i }); i++; continue; }
    if (c === '×' || c === '·') { tokens.push({ t: T.OP, v: '*', pos: i }); i++; continue; }
    if (c === '÷') { tokens.push({ t: T.OP, v: '/', pos: i }); i++; continue; }
    if (c === '−') { tokens.push({ t: T.OP, v: '-', pos: i }); i++; continue; }
    if (c === '√') { tokens.push({ t: T.IDENT, v: 'sqrt', pos: i }); i++; continue; }
    if (c === 'π') { tokens.push({ t: T.IDENT, v: 'pi', pos: i }); i++; continue; }
    if (c === 'θ') { tokens.push({ t: T.IDENT, v: 'theta', pos: i }); i++; continue; }
    if (c === '^' || c === '*' || c === '/' || c === '+' || c === '-' ||
        c === '=' || c === '<' || c === '>' || c === '!' || c === '&' || c === '|' || c === '?') {
      // 双字符运算符
      const two = src.slice(i, i + 2);
      if (['<=', '>=', '==', '!=', '&&', '||'].includes(two)) { tokens.push({ t: T.OP, v: two, pos: i }); i += 2; continue; }
      if (c === '=') { tokens.push({ t: T.OP, v: '==', pos: i }); i++; continue; }
      tokens.push({ t: T.OP, v: c, pos: i });
      i++;
      continue;
    }
    throw new SyntaxError('无法识别的字符 "' + c + '"（位置 ' + i + '）');
  }
  tokens.push({ t: T.END, v: '', pos: src.length });
  return tokens;
}

/* 插入隐式乘法：2x、2(x+1)、(x+1)(x-1)、2sin(x)、x y */
function withImplicitMul(tokens, src = '') {
  const out = [];
  const valueEnd = (tok) => tok && (tok.t === T.NUM || tok.t === T.IDENT || tok.t === T.RP);
  const valueStart = (tok) => tok && (tok.t === T.NUM || tok.t === T.IDENT || tok.t === T.LP);
  for (let i = 0; i < tokens.length; i++) {
    const cur = tokens[i];
    const prev = out[out.length - 1];
    if (prev && valueEnd(prev) && valueStart(cur)) {
      // 1) 函数名 + ( ：总是视为调用（即使中间有空格）
      if (prev.t === T.IDENT && cur.t === T.LP) {
        if (!FUNCTIONS[prev.v]) {
          throw new SyntaxError('未知函数 "' + prev.v + '"（若是乘法请写成 ' + prev.v + '*(...)）');
        }
      } else {
        if (prev.t === T.NUM && cur.t === T.NUM && src[cur.pos] === '.') {
          throw new SyntaxError('数字格式有误（位置 ' + cur.pos + '）');
        }
        out.push({ t: T.OP, v: '*', pos: cur.pos });
      }
    }
    out.push(cur);
  }
  return out;
}

/* ------------------------------ 语法分析 ------------------------------ */
function parseTokens(tokens) {
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  const expect = (type, v) => {
    const tok = peek();
    if (tok.t !== type || (v !== undefined && tok.v !== v)) {
      throw new SyntaxError('语法错误：位置 ' + tok.pos + ' 处期望 ' + (v || type) + '，得到 "' + tok.v + '"');
    }
    return next();
  };

  function parseExpression() { return parseTernary(); }

  function parseTernary() {
    const cond = parseOr();
    if (peek().t === T.OP && peek().v === '?') {
      next();
      const a = parseTernary();
      expect(T.OP, ':');
      const b = parseTernary();
      return { k: 'cond', cond, a, b };
    }
    return cond;
  }
  function parseOr() {
    let left = parseAnd();
    while (peek().t === T.OP && peek().v === '||') { next(); left = { k: 'bin', op: '||', l: left, r: parseAnd() }; }
    return left;
  }
  function parseAnd() {
    let left = parseCompare();
    while (peek().t === T.OP && peek().v === '&&') { next(); left = { k: 'bin', op: '&&', l: left, r: parseCompare() }; }
    return left;
  }
  function parseCompare() {
    let left = parseAdd();
    while (peek().t === T.OP && ['<', '>', '<=', '>=', '==', '!='].includes(peek().v)) {
      const op = next().v;
      left = { k: 'bin', op, l: left, r: parseAdd() };
    }
    return left;
  }
  function parseAdd() {
    let left = parseMul();
    while (peek().t === T.OP && (peek().v === '+' || peek().v === '-')) {
      const op = next().v;
      left = { k: 'bin', op, l: left, r: parseMul() };
    }
    return left;
  }
  function parseMul() {
    let left = parseUnary();
    while (peek().t === T.OP && (peek().v === '*' || peek().v === '/')) {
      const op = next().v;
      left = { k: 'bin', op, l: left, r: parseUnary() };
    }
    return left;
  }
  function parseUnary() {
    const tok = peek();
    if (tok.t === T.OP && (tok.v === '-' || tok.v === '+')) {
      next();
      const arg = parseUnary();
      return tok.v === '-' ? { k: 'neg', arg } : arg;
    }
    if (tok.t === T.OP && tok.v === '!') { next(); return { k: 'not', arg: parseUnary() }; }
    return parsePower();
  }
  function parsePower() {
    const base = parsePostfix();
    if (peek().t === T.OP && peek().v === '^') {
      next();
      const exp = parseUnary(); // 右结合
      return { k: 'pow', base, exp };
    }
    return base;
  }
  function parsePostfix() {
    let node = parsePrimary();
    // 后缀阶乘：3! / x! / (x+1)!（不会与 != 混淆）
    while (peek().t === T.OP && peek().v === '!' &&
           !(tokens[pos + 1] && tokens[pos + 1].t === T.OP && tokens[pos + 1].v === '=')) {
      next();
      node = { k: 'call', name: 'fact', args: [node] };
    }
    return node;
  }
  function parsePrimary() {
    const tok = next();
    if (tok.t === T.NUM) return { k: 'num', v: tok.v };
    if (tok.t === T.LP) {
      const inner = parseExpression();
      expect(T.RP);
      return inner;
    }
    if (tok.t === T.IDENT) {
      const name = tok.v;
      if (peek().t === T.LP) {
        next();
        const args = [];
        if (peek().t !== T.RP) {
          args.push(parseExpression());
          while (peek().t === T.COMMA) { next(); args.push(parseExpression()); }
        }
        expect(T.RP);
        if (!FUNCTIONS[name]) throw new SyntaxError('未知函数 "' + name + '"');
        return { k: 'call', name, args };
      }
      if (name in CONSTANTS) return { k: 'num', v: CONSTANTS[name] };
      return { k: 'var', name };
    }
    throw new SyntaxError('语法错误：位置 ' + tok.pos + ' 处意外的 "' + tok.v + '"');
  }

  const ast = parseExpression();
  const rest = peek();
  if (rest.t === T.RP) throw new SyntaxError('括号不匹配：位置 ' + rest.pos + ' 处多了一个 ")"');
  if (rest.t !== T.END) throw new SyntaxError('语法错误：位置 ' + rest.pos + ' 处多余的 "' + rest.v + '"');
  return ast;
}

export function parse(src) {
  if (typeof src !== 'string' || !src.trim()) throw new SyntaxError('表达式为空');
  const toks = withImplicitMul(tokenize(src), src);
  const opens = toks.filter((tk) => tk.t === T.LP).length;
  const closes = toks.filter((tk) => tk.t === T.RP).length;
  if (opens > closes) throw new SyntaxError('括号不匹配：缺少 ' + (opens - closes) + ' 个 ")"');
  if (closes > opens) throw new SyntaxError('括号不匹配：多了 ' + (closes - opens) + ' 个 ")"');
  return parseTokens(toks);
}

/* ------------------------------ 编译 ------------------------------ */
const CmpOps = {
  '<': (a, b) => (a < b ? 1 : 0), '>': (a, b) => (a > b ? 1 : 0),
  '<=': (a, b) => (a <= b ? 1 : 0), '>=': (a, b) => (a >= b ? 1 : 0),
  '==': (a, b) => (Math.abs(a - b) < 1e-12 ? 1 : 0), '!=': (a, b) => (Math.abs(a - b) < 1e-12 ? 0 : 1),
  '&&': (a, b) => (a && b ? 1 : 0), '||': (a, b) => (a || b ? 1 : 0)
};

function compileNode(node, scope) {
  switch (node.k) {
    case 'num': { const v = node.v; return () => v; }
    case 'var': {
      const name = node.name;
      if (name in scope) return (s) => s[name];
      throw new ReferenceError('未知变量 "' + name + '"');
    }
    case 'neg': { const a = compileNode(node.arg, scope); return (s) => -a(s); }
    case 'not': { const a = compileNode(node.arg, scope); return (s) => (a(s) ? 0 : 1); }
    case 'pow': {
      const b = compileNode(node.base, scope), e = compileNode(node.exp, scope);
      return (s) => Math.pow(b(s), e(s));
    }
    case 'cond': {
      const c = compileNode(node.cond, scope), a = compileNode(node.a, scope), b = compileNode(node.b, scope);
      return (s) => (c(s) ? a(s) : b(s));
    }
    case 'bin': {
      const l = compileNode(node.l, scope), r = compileNode(node.r, scope), op = node.op;
      switch (op) {
        case '+': return (s) => l(s) + r(s);
        case '-': return (s) => l(s) - r(s);
        case '*': return (s) => l(s) * r(s);
        case '/': return (s) => l(s) / r(s);
        default: {
          const fn = CmpOps[op];
          return (s) => fn(l(s), r(s));
        }
      }
    }
    case 'call': {
      const fn = FUNCTIONS[node.name];
      const args = node.args.map((a) => compileNode(a, scope));
      const n = args.length;
      if (n === 1) return (s) => fn(args[0](s));
      if (n === 2) return (s) => fn(args[0](s), args[1](s));
      if (n === 3) return (s) => fn(args[0](s), args[1](s), args[2](s));
      return (s) => fn(...args.map((a) => a(s)));
    }
    default:
      throw new SyntaxError('未知的语法节点 ' + node.k);
  }
}

export function collectVars(node, out = new Set()) {
  if (!node || typeof node !== 'object') return out;
  if (node.k === 'var') out.add(node.name);
  for (const key of ['arg', 'base', 'exp', 'cond', 'a', 'b', 'l', 'r']) if (node[key]) collectVars(node[key], out);
  if (node.args) node.args.forEach((a) => collectVars(a, out));
  return out;
}

/* 已知变量集合（避免把函数参数误判为自由变量） */
export const KNOWN_VARS = ['x', 'y', 't', 'theta', 'r', 'a', 'b', 'c', 'k', 'm', 'n', 's', 'u', 'v', 'w', 'h', 'p', 'q'];

/* ------------------------------ 对外接口 ------------------------------ */
export function compile(src, extraScope = null) {
  const ast = parse(src);
  const scope = Object.create(null);
  KNOWN_VARS.forEach((v) => { scope[v] = 0; });
  KNOWN_VARS.forEach((v) => { scope[v.toUpperCase()] = 0; });
  if (extraScope) Object.assign(scope, extraScope);
  const fn = compileNode(ast, scope);
  const vars = [...collectVars(ast)];
  return { ast, fn, vars, source: src };
}

/* 编译并返回函数；失败返回 { error } */
export function tryCompile(src, extraScope = null) {
  try {
    return compile(src, extraScope);
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err), source: src };
  }
}

/* 直接求值：evaluate('2x+1', { x: 3 }) === 7 */
export function evaluate(src, scope = {}) {
  const c = typeof src === 'string' ? compile(src) : src;
  return c.fn(scope);
}

/* 数值导数（中心差分，自适应步长） */
export function derivative(f, x, h = 0) {
  const step = h || Math.max(1e-7, Math.abs(x) * 1e-7 + 1e-7);
  const f1 = f(x + step), f2 = f(x - step);
  if (Number.isFinite(f1) && Number.isFinite(f2)) return (f1 - f2) / (2 * step);
  const f0 = f(x);
  return (f(x + step) - f0) / step;
}

export function secondDerivative(f, x) {
  const h = Math.max(1e-5, Math.abs(x) * 1e-5 + 1e-5);
  return (f(x + h) - 2 * f(x) + f(x - h)) / (h * h);
}

/* 自适应 Simpson 定积分 */
export function integrate(f, a, b, { tol = 1e-8, maxDepth = 20 } = {}) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return NaN;
  const simpson = (fa, fm, fb) => ((b - a) / 6) * (fa + 4 * fm + fb);
  const rec = (a, b, fa, fm, fb, whole, depth) => {
    const m = (a + b) / 2;
    const lm = (a + m) / 2, rm = (m + b) / 2;
    const flm = f(lm), frm = f(rm);
    const left = ((m - a) / 6) * (fa + 4 * flm + fm);
    const right = ((b - m) / 6) * (fm + 4 * frm + fb);
    const delta = left + right - whole;
    if (depth <= 0 || Math.abs(delta) <= 15 * tol) return left + right + delta / 15;
    return rec(a, m, fa, flm, fm, left, depth - 1) + rec(m, b, fm, frm, fb, right, depth - 1);
  };
  const fa = f(a), fb = f(b), m = (a + b) / 2, fm = f(m);
  if (!Number.isFinite(fa + fb + fm)) return NaN;
  return rec(a, b, fa, fm, fb, simpson(fa, fm, fb), maxDepth);
}

/* 括号自动补全 / 简易提示 */
export function balanceParens(src) {
  let open = 0, close = 0;
  for (const c of src) {
    if (c === '(') open++;
    else if (c === ')') close++;
  }
  return src + ')'.repeat(Math.max(0, open - close));
}

export const SAMPLES = {
  zh: [
    'sin(x)', 'cos(2x)', 'x^2/4 - 2', 'sin(x)/x', 'e^(-x^2/4)*3', 'ln(abs(x))',
    'tan(x)', 'sqrt(abs(x))', 'sin(3x)*e^(-abs(x)/3)', '1/(1+25x^2)', 'floor(x)', 'x*sin(1/x)'
  ],
  en: [
    'sin(x)', 'cos(2x)', 'x^2/4 - 2', 'sin(x)/x', 'e^(-x^2/4)*3', 'ln(abs(x))',
    'tan(x)', 'sqrt(abs(x))', 'sin(3x)*e^(-abs(x)/3)', '1/(1+25x^2)', 'floor(x)', 'x*sin(1/x)'
  ]
};
