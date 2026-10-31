(function () {
  'use strict';

  const S = 'var(--s)';
  const INNER = '#0b0e14';

  const FACES = [
    { key: 'px', cls: 'right', v: [ 1, 0, 0] },
    { key: 'nx', cls: 'left',  v: [-1, 0, 0] },
    { key: 'py', cls: 'up',    v: [ 0, 1, 0] },
    { key: 'ny', cls: 'down',  v: [ 0,-1, 0] },
    { key: 'pz', cls: 'front', v: [ 0, 0, 1] },
    { key: 'nz', cls: 'back',  v: [ 0, 0,-1] }
  ];

  const COLORS = {
    px: '#ef4444', nx: '#A600C7', py: '#f8fafc', ny: '#facc15', pz: '#22c55e', nz: '#3b82f6'
  };

  const cubeEl = document.getElementById('cube');
  const stageEl = document.getElementById('stage');
  const mirrorsEl = document.getElementById('mirrors');
  const moveCountEl = document.getElementById('moveCount');
  const stateTextEl = document.getElementById('stateText');
  const layerModeEl = document.getElementById('layerMode');
  const moveRow = document.getElementById('moveRow');
  const schemeBtn = document.getElementById('schemeBtn');
  const keyTip = document.getElementById('keyTip');

  const slowPanel = document.getElementById('slowPanel');
  const slowCountEl = document.getElementById('slowCount');
  const slowHintEl = document.getElementById('slowHint');
  const slowNextBtn = document.getElementById('slowNextBtn');
  const slowAutoBtn = document.getElementById('slowAutoBtn');
  const slowExitBtn = document.getElementById('slowExitBtn');
  const galleryPanel = document.getElementById('galleryPanel');
  const galBody = document.getElementById('galBody');
  const galClose = document.getElementById('galClose');
  const galHitEl = document.getElementById('galHit');
  const resetMenu = document.getElementById('resetMenu');
  const undoBtnEl = document.getElementById('undoBtn');
  const redoBtnEl = document.getElementById('redoBtn');
  const learnBtn = document.getElementById('learnBtn');

  let cubies = [];
  let moves = 0;
  const HOME_X = -24, HOME_Y = -34;
  let viewX = HOME_X, viewY = HOME_Y;
  let zoom = 1;

  /* ================= 基础工具 ================= */
  function rotMatrix(axis, deg) {
    const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    if (axis === 'x') return [[1, 0, 0], [0, c, -s], [0, s, c]];
    if (axis === 'y') return [[c, 0, s], [0, 1, 0], [-s, 0, c]];
    return [[c, -s, 0], [s, c, 0], [0, 0, 1]];
  }
  function applyMatrix(M, v) {
    return [
      M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2],
      M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2],
      M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2]
    ].map(n => Math.round(n));
  }
  function vecKey(v) {
    for (const f of FACES) if (f.v[0] === v[0] && f.v[1] === v[1] && f.v[2] === v[2]) return f.key;
    return null;
  }
  function translateOf(pos) {
    return 'translate3d(calc(' + S + ' * ' + pos[0] + '), calc(' + S + ' * ' + (-pos[1]) + '), calc(' + S + ' * ' + pos[2] + '))';
  }

  function buildCubie(x, y, z) {
    const el = document.createElement('div');
    el.className = 'cubie';
    const body = document.createElement('div');
    body.className = 'body';
    const faces = {};
    const colors = {};
    for (const f of FACES) {
      const d = document.createElement('div');
      d.className = 'face ' + f.cls;
      const onSurface =
        (f.v[0] === 1 && x === 1) || (f.v[0] === -1 && x === -1) ||
        (f.v[1] === 1 && y === 1) || (f.v[1] === -1 && y === -1) ||
        (f.v[2] === 1 && z === 1) || (f.v[2] === -1 && z === -1);
      colors[f.key] = onSurface ? COLORS[f.key] : null;
      body.appendChild(d);
      faces[f.key] = d;
    }
    el.appendChild(body);
    const cubie = { pos: [x, y, z], colors: colors, faces: faces, el: el, body: body };
    el.__cubie = cubie;
    paint(cubie);
    body.style.transform = translateOf(cubie.pos);
    return cubie;
  }
  function paint(cubie) {
    for (const f of FACES) cubie.faces[f.key].style.background = cubie.colors[f.key] || INNER;
  }
  function buildCube() {
    cubeEl.innerHTML = '';
    cubies = [];
    for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
      if (x === 0 && y === 0 && z === 0) continue;
      const c = buildCubie(x, y, z);
      cubies.push(c);
      cubeEl.appendChild(c.el);
    }
    applyView();
    refreshMirrors();
  }

  const MOVE_DEF = {
    U: { axis: 'y', layer: 1, angle: -90 },
    D: { axis: 'y', layer: -1, angle: 90 },
    R: { axis: 'x', layer: 1, angle: -90 },
    L: { axis: 'x', layer: -1, angle: 90 },
    F: { axis: 'z', layer: 1, angle: -90 },
    B: { axis: 'z', layer: -1, angle: 90 }
  };
  const MID_DEF = {
    M: { axis: 'x', layer: 0, angle: 90 },
    E: { axis: 'y', layer: 0, angle: 90 },
    S: { axis: 'z', layer: 0, angle: -90 }
  };
  const AXIS_INDEX = { x: 0, y: 1, z: 2 };

  /* ★ 先定义 MID_BASE，避免 TDZ */
  const MID_BASE = { x: 90, y: 90, z: -90 };

  /* 当前视角下，屏幕的 上/下/左/右/前/后 分别是魔方的哪个面 */
  const FACE_VEC6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  function screenFaceVec(which) {
    let best = FACE_VEC6[0], bestVal = -Infinity;
    for (const f of FACE_VEC6) {
      const v = viewOf(f);
      const val = which === 'U' ? -v[1] : which === 'D' ? v[1]
        : which === 'L' ? -v[0] : which === 'R' ? v[0]
        : which === 'F' ? v[2] : -v[2];
      if (val > bestVal) { bestVal = val; best = f; }
    }
    return best;
  }

  const MID_PARTNER = { M: 'L', E: 'D', S: 'F' };

  /* U D L R F B 统一按「你看到的方位」来转（视角转了，它就跟着转）。
     M / E / S 跟着对应的外层 L / D / F 走，这样视角转 90°/180°/270° 后依然自洽
     （x、y 转体的展开式 x = R M' L' / y = U E' D' 在任意绕竖轴的视角下都成立）。 */
  function parseMoveData(name) {
    const face = name[0].toUpperCase();
    const isPrime = name.length > 1 && (name[1] === "'" || name[1] === '’');
    const isDouble = name.length > 1 && name[1] === '2';
    if (!MOVE_DEF[face] && !MID_DEF[face]) return null;
    let axis, layer, angle;
    if (MOVE_DEF[face]) {
      const u = screenFaceVec(face);
      const k = u[0] ? 0 : (u[1] ? 1 : 2);
      axis = ['x', 'y', 'z'][k];
      layer = u[k];
      angle = -90 * u[k];              // 从该面外侧看顺时针
    } else {
      const def = MID_DEF[face];
      const u = screenFaceVec(MID_PARTNER[face]);
      const k = u[0] ? 0 : (u[1] ? 1 : 2);
      const ax = ['x', 'y', 'z'][k];
      if (ax === def.axis) {           // 视角只是绕这根轴转了整圈 → 方向跟着翻
        axis = ax; layer = 0; angle = -90 * u[k];
      } else {                         // 视角把这对侧面转走了 → 保持原定义
        axis = def.axis; layer = 0; angle = def.angle;
      }
    }
    if (isPrime) angle = -angle;
    if (isDouble) angle = angle * 2;
    return { axis: axis, layer: layer, angle: angle };
  }

  function parseMove(name) { return parseMoveData(name) || { axis: 'x', layer: 1, angle: 0 }; }

  function opLabel(op) {
    if (op.layer === 0) {
      const mid = { x: 'M', y: 'E', z: 'S' }[op.axis];
      const base = MID_BASE[op.axis];
      if (op.angle === base) return mid;
      if (op.angle === -base) return mid + "'";
      if (op.angle === base * 2 || op.angle === -base * 2) return mid + '2';
      return mid;
    }
    const map = {
      x: { '1': ['R', -90], '-1': ['L', 90] },
      y: { '1': ['U', -90], '-1': ['D', 90] },
      z: { '1': ['F', -90], '-1': ['B', 90] }
    };
    const m = map[op.axis] && map[op.axis][String(op.layer)];
    if (!m) return '?';
    if (op.angle === m[1]) return m[0];
    if (op.angle === -m[1]) return m[0] + "'";
    if (op.angle === m[1] * 2 || op.angle === -m[1] * 2) return m[0] + '2';
    return m[0];
  }

  /* ================= 还原状态判断 ================= */
  function isSolvedNow() {
    for (const f of FACES) {
      const i = AXIS_INDEX[f.v[0] ? 'x' : f.v[1] ? 'y' : 'z'];
      const layer = f.v[i];
      let color = null;
      for (const c of cubies) {
        if (c.pos[i] !== layer) continue;
        const col = c.colors[f.key];
        if (!col) continue;
        if (color === null) color = col;
        else if (col !== color) return false;
      }
    }
    return true;
  }

  /* ================= 整体朝向标准化 =================
     匹配时把「标准坐标」映射到「空间坐标」，再读块的颜色。
     这样无论整体怎么转体，同一局面都能命中同一张卡。 */
  let MATCH_ORIENT = null;

  function computeOrient() {
    const centerOf = {};
    for (const f of FACES) {
      const cu = findCubie(f.v[0], f.v[1], f.v[2]);
      if (cu) centerOf[f.key] = cu.colors[f.key];
    }
    let dY = null, dG = null;
    for (const f of FACES) {
      if (centerOf[f.key] === COLORS.ny) dY = f.v;
      if (centerOf[f.key] === COLORS.pz) dG = f.v;
    }
    if (!dY || !dG) return null;
    const yStd = [-dY[0], -dY[1], -dY[2]];          // 标准 +y
    const zStd = [dG[0], dG[1], dG[2]];             // 标准 +z
    const xStd = [
      yStd[1]*zStd[2] - yStd[2]*zStd[1],
      yStd[2]*zStd[0] - yStd[0]*zStd[2],
      yStd[0]*zStd[1] - yStd[1]*zStd[0]
    ];
    return [
      [xStd[0], yStd[0], zStd[0]],
      [xStd[1], yStd[1], zStd[1]],
      [xStd[2], yStd[2], zStd[2]]
    ];
  }

  function orientPos(p) {
    if (!MATCH_ORIENT) return p;
    const M = MATCH_ORIENT;
    return [
      M[0][0]*p[0] + M[0][1]*p[1] + M[0][2]*p[2],
      M[1][0]*p[0] + M[1][1]*p[1] + M[1][2]*p[2],
      M[2][0]*p[0] + M[2][1]*p[1] + M[2][2]*p[2]
    ].map(n => Math.round(n));
  }

  function orientFace(fk) {
    if (!MATCH_ORIENT) return fk;
    const f = FACES.find(x => x.key === fk);
    if (!f) return fk;
    return vecKey(applyMatrix(MATCH_ORIENT, f.v));
  }

  function findCubieStd(x, y, z) {
    const p = orientPos([x, y, z]);
    return findCubie(p[0], p[1], p[2]);
  }

  /* ================= 还原栈：自上次还原以来做过的所有转动 ================= */
  let opStack = [];
  let redoStack = [];

  /* ================= 慢放复位 ================= */
  let slowMode = false;
  let slowAuto = false;
  let slowTimer = 0;

  function nextUndoOp() {
    if (!opStack.length) return null;
    const op = opStack[opStack.length - 1];
    return { axis: op.axis, layer: op.layer, angle: -op.angle };
  }

  function refreshSlow() {
    if (!slowMode) return;
    const n = opStack.length;
    if (n === 0) {
      slowCountEl.textContent = '已完成';
      slowHintEl.innerHTML = '<span class="done">🎉 魔方已还原</span>';
      slowNextBtn.disabled = true;
      slowAutoBtn.disabled = true;
      stopSlowAuto();
      return;
    }
    slowCountEl.textContent = '剩余 ' + n + ' 步';
    slowHintEl.innerHTML = '下一步：<b class="mv">' + opLabel(nextUndoOp()) + '</b>';
    slowNextBtn.disabled = busy;
    slowAutoBtn.disabled = false;
  }

  function doSlowStep() {
    if (!slowMode || busy) return;
    const step = nextUndoOp();
    if (!step) return;
    pushTurn(step.axis, step.layer, step.angle, { learnStep: true, ms: 340 });
  }

  function startSlowAuto() {
    if (!slowMode || slowAuto) return;
    slowAuto = true;
    slowAutoBtn.textContent = '暂停';
    clearInterval(slowTimer);
    slowTimer = setInterval(function () {
      if (!slowMode || !slowAuto) return;
      if (busy) return;
      if (!opStack.length) { stopSlowAuto(); refreshSlow(); return; }
      doSlowStep();
    }, 560);
  }

  function stopSlowAuto() {
    slowAuto = false;
    clearInterval(slowTimer);
    slowTimer = 0;
    if (slowAutoBtn) slowAutoBtn.textContent = '自动播放';
  }

  function enterSlow() {
    stopRun(true);
    closeGallery();
    slowMode = true;
    stopSlowAuto();
    resetMenu.classList.remove('show');
    moveRow.classList.add('hidden');
    slowPanel.classList.add('show');
    refreshSlow();
  }

  function exitSlow() {
    stopSlowAuto();
    slowMode = false;
    slowPanel.classList.remove('show');
    moveRow.classList.remove('hidden');
  }

  slowNextBtn.addEventListener('click', doSlowStep);
  slowAutoBtn.addEventListener('click', function () { slowAuto ? stopSlowAuto() : startSlowAuto(); });
  slowExitBtn.addEventListener('click', exitSlow);

  /* ================= 复位菜单 ================= */
  const resetBtnEl = document.getElementById('resetBtn');
  resetBtnEl.addEventListener('click', function (e) {
    e.stopPropagation();
    resetMenu.classList.toggle('show');
  });
  resetMenu.addEventListener('click', function (e) { e.stopPropagation(); });
  document.addEventListener('click', function () { resetMenu.classList.remove('show'); });
  document.getElementById('resetInstant').addEventListener('click', function () {
    resetMenu.classList.remove('show');
    reset();
  });
  document.getElementById('resetSlow').addEventListener('click', function () {
    resetMenu.classList.remove('show');
    enterSlow();
  });

  /* ================= 公式图册 ================= */
  const GALLERY = [{"step":2,"name":"黄色朝右","alg":"R U R'","hint":"把角块转到目标槽（右下前）正上方，黄色贴在右面","d":{"py":[[null,null,"R"],[null,"W",null],[null,null,null]],"pz":[[null,null,"G"],[null,"G",null],[null,null,null]],"px":[[null,null,"Y"],[null,"R",null],[null,null,null]]},"d2":{"py":[[null,null,null],[null,"W",null],[null,null,null]],"pz":[[null,null,null],[null,"G",null],[null,null,"G"]],"px":[[null,null,null],[null,"R",null],[null,null,"R"]]},"faces":["py","pz","px"]},{"step":2,"name":"黄色朝上","alg":"R U2 R' U' R U R'","hint":"黄色朝上是最麻烦的一种，用这条一次到位","d":{"py":[[null,null,"Y"],[null,"W",null],[null,null,null]],"pz":[[null,null,"R"],[null,"G",null],[null,null,null]],"px":[[null,null,"G"],[null,"R",null],[null,null,null]]},"d2":{"py":[[null,null,null],[null,"W",null],[null,null,null]],"pz":[[null,null,null],[null,"G",null],[null,null,"G"]],"px":[[null,null,null],[null,"R",null],[null,null,"R"]]},"faces":["py","pz","px"]},{"step":2,"name":"黄色朝前","alg":"F' U' F","hint":"黄色贴在前面的情况","d":{"py":[[null,null,"G"],[null,"W",null],[null,null,null]],"pz":[[null,null,"Y"],[null,"G",null],[null,null,null]],"px":[[null,null,"R"],[null,"R",null],[null,null,null]]},"d2":{"py":[[null,null,null],[null,"W",null],[null,null,null]],"pz":[[null,null,null],[null,"G",null],[null,null,"G"]],"px":[[null,null,null],[null,"R",null],[null,null,"R"]]},"faces":["py","pz","px"]},{"step":3,"name":"右插（棱块转向右）","alg":"U R U' R' U' F' U F","hint":"棱块在顶层，正面颜色对着自己 → 插到右下","d":{"py":[[null,"R",null],[null,"W",null],[null,null,null]],"pz":[[null,"G",null],[null,"G",null],[null,null,null]],"px":[[null,null,null],[null,"R",null],[null,null,null]]},"d2":{"py":[[null,null,null],[null,"W",null],[null,null,null]],"pz":[[null,null,null],[null,"G","G"],[null,null,null]],"px":[[null,null,null],[null,"R","R"],[null,null,null]]},"faces":["py","pz","px"]},{"step":3,"name":"左槽插入（公式三·左）","alg":"U' L' U L U F U' F'","hint":"棱块在顶层、正面颜色对着自己 → 插到左下（层先法写法）","d":{"py":[[null,null,null],[null,"W",null],[null,null,null]],"pz":[[null,null,null],[null,"G","G"],[null,null,null]],"px":[[null,null,null],[null,"R","R"],[null,null,null]]},"d2":{"py":[[null,null,null],[null,"W",null],[null,null,null]],"pz":[[null,null,null],[null,"G","G"],[null,null,null]],"px":[[null,null,null],[null,"R","R"],[null,null,null]]},"faces":["py","pz","px"]},{"step":3,"name":"左插（棱块转向左）","alg":"U' F' U F U R U' R'","hint":"棱块在顶层，正面颜色对着自己 → 插到左下","d":{"py":[[null,null,null],[null,"W","G"],[null,null,null]],"pz":[[null,null,null],[null,"G",null],[null,null,null]],"px":[[null,"R",null],[null,"R",null],[null,null,null]]},"d2":{"py":[[null,null,null],[null,"W",null],[null,null,null]],"pz":[[null,null,null],[null,"G","G"],[null,null,null]],"px":[[null,null,null],[null,"R","R"],[null,null,null]]},"faces":["py","pz","px"]},{"step":4,"name":"点（顶面只有中心）","alg":"F R U R' U' F'","hint":"顶面只有中心/一字/L 都算同一类，反复执行到出现十字","d":{"py":[[null,"R",null],["B","W","G"],[null,"P",null]]},"d2":{"py":[[null,"W",null],["W","W","W"],[null,"W",null]],"pz":[[null,"G",null],[null,null,null],[null,null,null]],"px":[[null,"R",null],[null,null,null],[null,null,null]]},"faces":["py"]},{"step":4,"name":"一字（左右相对）","alg":"F R U R' U' F'","hint":"顶面只有中心/一字/L 都算同一类，反复执行到出现十字","d":{"py":[[null,"R",null],["W","W","W"],[null,"G",null]]},"d2":{"py":[[null,"W",null],["W","W","W"],[null,"W",null]],"pz":[[null,"G",null],[null,null,null],[null,null,null]],"px":[[null,"R",null],[null,null,null],[null,null,null]]},"faces":["py"]},{"step":4,"name":"L 形（两条相邻）","alg":"F R U R' U' F'","hint":"顶面只有中心/一字/L 都算同一类，反复执行到出现十字","d":{"py":[[null,"B",null],["W","W","G"],[null,"W",null]]},"d2":{"py":[[null,"W",null],["W","W","W"],[null,"W",null]],"pz":[[null,"G",null],[null,null,null],[null,null,null]],"px":[[null,"R",null],[null,null,null],[null,null,null]]},"faces":["py"]},{"step":4,"name":"十字 → 小鱼","alg":"R U R' U R U2 R'","hint":"十字已好、顶面只有十字：做一次这条会出现「小鱼」（十字 + 1 个顶角同色），再去 ⑤ 对照小鱼公式","d":{"py":[["G","W","G"],["W","W","W"],["B","W","B"]]},"d2":{"py":[["W","W","P"],["W","W","W"],["R","W","G"]],"pz":[["B","G","W"],["G","G","G"],["G","G","G"]],"px":[["W","B","B"],["R","R","R"],["R","R","R"]]},"faces":["py"]},{"step":5,"name":"Sune","alg":"R U R' U R U2 R'","hint":"顶面颜色形态决定用哪条","d":{"py":[["W","W","P"],["W","W","W"],["R","W","G"]]},"d2":{"py":[["W","W","W"],["W","W","W"],["W","W","W"]],"pz":[["G","G","G"],["G","G","G"],["G","G","G"]],"px":[["R","R","R"],["R","R","R"],["R","R","R"]]},"tw":[1,0,1,1],"faces":["py"]},{"step":5,"name":"ASune","alg":"R' U' R U' R' U2 R","hint":"顶面颜色形态决定用哪条","d":{"py":[["R","W","B"],["W","W","W"],["W","W","P"]]},"d2":{"py":[["W","W","W"],["W","W","W"],["W","W","W"]],"pz":[["G","G","G"],["G","G","G"],["G","G","G"]],"px":[["R","R","R"],["R","R","R"],["R","R","R"]]},"tw":[-1,-1,0,-1],"faces":["py"]},{"step":5,"name":"H","alg":"R U R' U R U' R' U R U2 R'","hint":"顶面颜色形态决定用哪条","d":{"py":[["G","W","G"],["W","W","W"],["B","W","B"]]},"d2":{"py":[["W","W","W"],["W","W","W"],["W","W","W"]],"pz":[["G","G","G"],["G","G","G"],["G","G","G"]],"px":[["R","R","R"],["R","R","R"],["R","R","R"]]},"tw":[-1,1,-1,1],"faces":["py"]},{"step":5,"name":"Pi","alg":"R U2 R2 U' R2 U' R2 U2 R","hint":"顶面颜色形态决定用哪条","d":{"py":[["B","W","P"],["W","W","W"],["G","W","P"]]},"d2":{"py":[["W","W","W"],["W","W","W"],["W","W","W"]],"pz":[["G","G","G"],["G","G","G"],["G","G","G"]],"px":[["R","R","R"],["R","R","R"],["R","R","R"]]},"tw":[1,1,-1,-1],"faces":["py"]},{"step":5,"name":"U","alg":"R2 D R' U2 R D' R' U2 R'","hint":"顶面颜色形态决定用哪条","d":{"py":[["R","W","G"],["W","W","W"],["W","W","W"]]},"d2":{"py":[["W","W","W"],["W","W","W"],["W","W","W"]],"pz":[["G","G","G"],["G","G","G"],["G","G","G"]],"px":[["R","R","R"],["R","R","R"],["R","R","R"]]},"tw":[1,-1,0,0],"faces":["py"]},{"step":5,"name":"左手小鱼（公式五）","alg":"L' U' L U' L' U2 L","hint":"顶面出现小鱼、鱼头朝左上时用左手这条","d":{"py":[["R","W","W"],["W","W","W"],["G","W","P"]]},"d2":{"py":[["W","W","W"],["W","W","W"],["W","W","W"]],"pz":[["G","G","G"],["G","G","G"],["G","G","G"]],"px":[["R","R","R"],["R","R","R"],["R","R","R"]]},"tw":[0,-1,-1,-1],"faces":["py"]},{"step":5,"name":"T（备查）","alg":"R U R' U' R' F R F'","hint":"⚠ 这条跑完会打散顶面十字，本页只作公式存档","d":{"py":[["R","R","W"],["W","W","W"],["G","G","W"]]},"d2":{"py":[["W","W","W"],["W","W","W"],["W","W","W"]],"pz":[["G","G","G"],["G","G","G"],["G","G","G"]],"px":[["R","R","R"],["R","R","R"],["R","R","R"]]},"noTw":true,"faces":["py"]},{"step":5,"name":"L","alg":"R' U2 R U R' U R U' R U2 R' U' R U' R'","hint":"两角对角朝上；对不上就先转 U 再试，最多转 3 次","d":{"py":[["W","W","R"],["W","W","W"],["G","W","W"]]},"d2":{"py":[["W","W","W"],["W","W","W"],["W","W","W"]],"pz":[["G","G","G"],["G","G","G"],["G","G","G"]],"px":[["R","R","R"],["R","R","R"],["R","R","R"]]},"tw":[-1,0,1,0],"faces":["py"]},{"step":6,"name":"三角换 · 顺时针","alg":"R' F R' B2 R F' R' B2 R2","hint":"三个角块循环，块已朝上只差位置","d":{"py":[["W","W","W"],["W","W","W"],["W","W","W"]],"pz":[["G","G","B"],["G","G","G"],["G","G","G"]],"px":[["G","R","P"],["R","R","R"],["R","R","R"]]},"d2":{"py":[["W","W","W"],["W","W","W"],["W","W","W"]],"pz":[["G","G","G"],["G","G","G"],["G","G","G"]],"px":[["R","R","R"],["R","R","R"],["R","R","R"]]},"faces":["py","pz","px"]},{"step":6,"name":"E 型 · 两对对角角块互换","alg":"U2 R U' R U R U R U' R' U' R2 U R U' R U R U R U' R' U' R2 U'","hint":"顶面全好、棱全对、四角全错位；先转 U2 再开始","d":{"py":[["W","W","W"],["W","W","W"],["W","W","W"]],"pz":[["B","G","B"],["G","G","G"],["G","G","G"]],"px":[["P","R","P"],["R","R","R"],["R","R","R"]]},"d2":{"py":[["W","W","W"],["W","W","W"],["W","W","W"]],"pz":[["G","G","G"],["G","G","G"],["G","G","G"]],"px":[["R","R","R"],["R","R","R"],["R","R","R"]]},"faces":["py","pz","px"]},{"step":6,"name":"公式六（层先法·转体写法）","alg":"x' R2 D2 R' U' R D2 R' U R' x","hint":"层先法公式六：原式需要把魔方转成「顶→前、前→底」再做，这里已展开成 x' … x，照做即可","d":{"py":[["W","W","W"],["W","W","W"],["W","W","W"]],"pz":[["B","G","P"],["G","G","G"],["G","G","G"]],"px":[["G","R","G"],["R","R","R"],["R","R","R"]]},"d2":{"py":[["W","W","W"],["W","W","W"],["W","W","W"]],"pz":[["G","G","G"],["G","G","G"],["G","G","G"]],"px":[["R","R","R"],["R","R","R"],["R","R","R"]]},"faces":["py","pz","px"]},{"step":6,"name":"三角换 · 逆时针","alg":"R2 B2 R F R' B2 R F' R","hint":"镜像情况","d":{"py":[["W","W","W"],["W","W","W"],["W","W","W"]],"pz":[["G","G","R"],["G","G","G"],["G","G","G"]],"px":[["B","R","B"],["R","R","R"],["R","R","R"]]},"d2":{"py":[["W","W","W"],["W","W","W"],["W","W","W"]],"pz":[["G","G","G"],["G","G","G"],["G","G","G"]],"px":[["R","R","R"],["R","R","R"],["R","R","R"]]},"faces":["py","pz","px"]},{"step":7,"name":"三棱换 · Ua","alg":"R U' R U R U R U' R' U' R2","hint":"三个棱块循环","d":{"py":[["W","W","W"],["W","W","W"],["W","W","W"]],"pz":[["G","R","G"],["G","G","G"],["G","G","G"]],"px":[["R","P","R"],["R","R","R"],["R","R","R"]]},"d2":{"py":[["W","W","W"],["W","W","W"],["W","W","W"]],"pz":[["G","G","G"],["G","G","G"],["G","G","G"]],"px":[["R","R","R"],["R","R","R"],["R","R","R"]]},"faces":["py","pz","px"]},{"step":7,"name":"三棱换 · Ub","alg":"R2 U R U R' U' R' U' R' U R'","hint":"反向循环","d":{"py":[["W","W","W"],["W","W","W"],["W","W","W"]],"pz":[["G","P","G"],["G","G","G"],["G","G","G"]],"px":[["R","G","R"],["R","R","R"],["R","R","R"]]},"d2":{"py":[["W","W","W"],["W","W","W"],["W","W","W"]],"pz":[["G","G","G"],["G","G","G"],["G","G","G"]],"px":[["R","R","R"],["R","R","R"],["R","R","R"]]},"faces":["py","pz","px"]},{"step":7,"name":"四棱交换 · H","alg":"M2 U M2 U2 M2 U M2","hint":"对面两对棱互换","d":{"py":[["W","W","W"],["W","W","W"],["W","W","W"]],"pz":[["G","B","G"],["G","G","G"],["G","G","G"]],"px":[["R","P","R"],["R","R","R"],["R","R","R"]]},"d2":{"py":[["W","W","W"],["W","W","W"],["W","W","W"]],"pz":[["G","G","G"],["G","G","G"],["G","G","G"]],"px":[["R","R","R"],["R","R","R"],["R","R","R"]]},"faces":["py","pz","px"]},{"step":7,"name":"四棱交叉 · Z","alg":"M2 U M2 U M' U2 M2 U2 M'","hint":"对面两棱互换","d":{"py":[["W","W","W"],["W","W","W"],["W","W","W"]],"pz":[["B","P","B"],["G","G","G"],["G","G","G"]],"px":[["P","B","P"],["R","R","R"],["R","R","R"]]},"d2":{"py":[["W","W","W"],["W","W","W"],["W","W","W"]],"pz":[["G","G","G"],["G","G","G"],["G","G","G"]],"px":[["R","R","R"],["R","R","R"],["R","R","R"]]},"faces":["py","pz","px"]}];

  /* ================= 层先法公式集（eder 版，默认） =================
     记号：每面 9 格从左到右、从上到下；U 面的第 1 行靠后（展开图直觉）。
     中心色即符号：a=U 心, b=F 心, c=R 心, d=L 心, e=B 心, f=D 心。
     比对只用「卡片上出现过颜色的格子」，灰格不参与；
     同时命中多条时，比中格子多的那条优先。 */
  const LG_FACE_OF = { U: 'py', F: 'pz', R: 'px', L: 'nx', B: 'nz', D: 'ny' };
  const LG_FACE_VEC = { U: [0, 1, 0], F: [0, 0, 1], R: [1, 0, 0], L: [-1, 0, 0], B: [0, 0, -1], D: [0, -1, 0] };
  const LG_REF = { a: 'py', b: 'pz', c: 'px', d: 'nx', e: 'nz', f: 'ny' };
  const LG_HEX = { a: 'W', b: 'G', c: 'R', d: 'P', e: 'B', f: 'Y' };

  /* 每面 9 格 -> 三维坐标（行 0 在最上面） */
  function lgCellPos(face, r, c) {
    switch (face) {
      case 'U': return [c - 1, 1, r - 1];
      case 'D': return [c - 1, -1, 1 - r];
      case 'F': return [c - 1, 1 - r, 1];
      case 'B': return [1 - c, 1 - r, -1];
      case 'R': return [1, 1 - r, 1 - c];
      case 'L': return [-1, 1 - r, c - 1];
    }
    return [0, 0, 0];
  }
  function lgRotV(v, k) {
    let x = v[0], z = v[2];
    const n = ((k % 4) + 4) % 4;
    for (let i = 0; i < n; i++) { const nx = -z; z = x; x = nx; }
    return [x, v[1], z];
  }

  /* 层先法公式 */
  const LG_ALG = {
    f2: "U R U' R' U' F' U F",
    f3: "R' U' R' U' R' U R U R",
    f4: "R U2 R' U R U2 R' U F' U' F",
    f5: "F R U R' U' F'",
    f6: "R' U2 R U R' U R",
    f7: "U' R U2 R' U' R U' R'",
    f8: "R B' R F2 R' B R F2 R2",
    f9: "R U' R U R U R U' R' U' R2",
    f10: "R2 U R U R' U' R' U' R' U R'"
  };
  const lgJoin = function () {
    const out = [];
    for (let i = 0; i < arguments.length; i++) out.push.apply(out, arguments[i].split(' ').filter(Boolean));
    return out.join(' ');
  };

  /* ② 底层角块：直接复用「进阶」里已验证过的三张卡（图 + 公式 + 用后图） */
  const LG_STEP2 = GALLERY.filter(function (c) { return c.step === 2; }).map(function (p) {
    return { step: 2, name: p.name, alg: p.alg, hint: p.hint, d: p.d, d2: p.d2 };
  });

  const LAYER_GALLERY = [
    ...LG_STEP2,
    { step: 3, name: '中层·右插（情况一）', alg: LG_ALG.f2,
      hint: '棱块在顶层、前色朝前 → 插到右前槽（公式二）',
      cells: [['U.5','a'],['F.5','b'],['R.5','c'],['U.8','c'],['F.2','b']] },
    { step: 3, name: '中层·情况二', alg: LG_ALG.f3,
      hint: '棱块在顶层右侧，顶色=前面色（公式三）',
      cells: [['U.5','a'],['F.5','b'],['R.5','c'],['U.6','b'],['R.2','c']] },
    { step: 3, name: '中层·情况三', alg: LG_ALG.f4,
      hint: '棱块卡在右前槽且方向不对，先把它请出来（公式四）',
      cells: [['U.5','a'],['F.5','b'],['R.5','c'],['F.6','c'],['R.4','b']] },
    { step: 4, name: '顶面一字', alg: LG_ALG.f5,
      hint: '顶面一条横线（4-6），做公式五',
      cells: [['U.5','a'],['U.4','a'],['U.6','a']] },
    { step: 4, name: '顶面 L 形', alg: lgJoin(LG_ALG.f5, LG_ALG.f5),
      hint: '两条相邻（2-4），公式五做两遍',
      cells: [['U.5','a'],['U.2','a'],['U.4','a']] },
    { step: 4, name: '顶面只有中心（点）', alg: lgJoin(LG_ALG.f5, LG_ALG.f5, 'U', LG_ALG.f5),
      hint: '只有中心块朝上：两遍公式五 + U + 一遍公式五',
      cells: [['U.5','a']] },
    { step: 5, name: '角朝向 · 情况一', alg: LG_ALG.f6, tw: [0, 1, 1, 1],
      hint: '十字已好、一个角朝上，顶色贴在右面（公式六）',
      cells: [['U.5','a'],['U.2','a'],['U.4','a'],['U.6','a'],['U.8','a'],['U.9','a'],['R.3','a']] },
    { step: 5, name: '角朝向 · 情况二', alg: LG_ALG.f7, tw: [0, -1, -1, -1],
      hint: '同上，顶色贴在前面（公式七）',
      cells: [['U.5','a'],['U.2','a'],['U.4','a'],['U.6','a'],['U.8','a'],['U.9','a'],['F.1','a']] },
    { step: 5, name: '角朝向 · 情况三', alg: lgJoin(LG_ALG.f6, LG_ALG.f7), tw: [-1, 0, 1, 0],
      hint: '只缺一个角：公式六（看是否变成情况二）+ 公式七',
      cells: [['U.2','a'],['U.3','a'],['U.4','a'],['U.5','a'],['U.6','a'],['U.7','a'],['U.8','a'],['R.1','a']] },
    { step: 5, name: '角朝向 · 情况四', alg: lgJoin(LG_ALG.f6, LG_ALG.f6), tw: [1, -1, 1, -1],
      hint: '顶面两个角朝上（斜对）：公式六 + 公式六',
      cells: [['U.2','a'],['U.4','a'],['U.5','a'],['U.6','a'],['U.8','a'],['F.1','a'],['F.3','a']] },
    { step: 5, name: '角朝向 · 情况五', alg: lgJoin(LG_ALG.f7, LG_ALG.f6), tw: [1, 0, 0, -1],
      hint: '顶面两个角朝上（另一斜向）：公式七 + 公式六',
      cells: [['U.1','a'],['U.2','a'],['U.4','a'],['U.5','a'],['U.7','a'],['U.8','a'],['F.3','a']] },
    { step: 5, name: '角朝向 · 情况六', alg: lgJoin(LG_ALG.f6, "U'", LG_ALG.f6), tw: [1, -1, -1, 1],
      hint: '顶面三个角朝上：公式六 + U\' + 公式六',
      cells: [['U.2','a'],['U.4','a'],['U.5','a'],['U.6','a'],['U.8','a'],['F.1','a'],['F.3','a'],['R.3','a']] },
    { step: 5, name: '角朝向 · 情况七', alg: lgJoin(LG_ALG.f7, 'U2', LG_ALG.f6), tw: [1, -1, 0, 0],
      hint: '顶面三个角朝上（另一种）：公式七 + U2 + 公式六',
      cells: [['U.1','a'],['U.2','a'],['U.3','a'],['U.4','a'],['U.5','a'],['U.6','a'],['U.8','a'],['F.1','a'],['F.3','a']] },
    { step: 6, name: '角归位 · 情况一', alg: LG_ALG.f8,
      hint: '前右上、前左上两块侧面同色 → 公式八',
      cells: [['F.1','c'],['F.3','c']] },
    { step: 6, name: '角归位 · 情况二', alg: lgJoin(LG_ALG.f8, LG_ALG.f8),
      hint: '两对对角互换：先做一遍公式八变成情况一，再做一遍',
      cells: [['F.1','e'],['F.2','b'],['F.3','d'],['R.1','b'],['R.2','c'],['R.3','b']],
      bars: { B: ['c','e','e'], L: ['d','d','c'] } },
    { step: 7, name: '棱归位 · 三棱逆时针', alg: LG_ALG.f9,
      hint: '三个棱块逆时针循环（公式九）',
      cells: [['F.1','b'],['F.3','b'],['R.1','c'],['R.3','c'],['F.2','c'],['R.2','d']],
      bars: { B: ['e','e','e'], L: ['d','b','d'] } },
    { step: 7, name: '棱归位 · 三棱顺时针', alg: LG_ALG.f10,
      hint: '三个棱块顺时针循环（公式十）',
      cells: [['F.1','b'],['F.3','b'],['R.1','c'],['R.3','c'],['F.2','d'],['R.2','b']],
      bars: { B: ['e','e','e'], L: ['d','c','d'] } },
    { step: 7, name: '棱归位 · 对向两棱互换', alg: lgJoin(LG_ALG.f9, 'U', LG_ALG.f9, "U'"),
      hint: '对向两棱块互换：公式九 + U + 公式九 + U\'',
      cells: [['F.1','b'],['F.3','b'],['R.1','c'],['R.3','c'],['F.2','e'],['R.2','d']],
      bars: { B: ['e','b','e'], L: ['d','c','d'] } },
    { step: 7, name: '棱归位 · 相邻两棱互换', alg: lgJoin(LG_ALG.f9, "U'", LG_ALG.f9, 'U'),
      hint: '相邻两棱块互换：公式九 + U\' + 公式九 + U',
      cells: [['F.1','b'],['F.3','b'],['R.1','c'],['R.3','c'],['F.2','c'],['R.2','b']],
      bars: { B: ['e','d','e'], L: ['d','e','d'] } }
  ];

  const LG_SEC_TITLE = {
    2: '② 底层角块（第一层）',
    3: '③ 中层四个棱块（层先法）',
    4: '④ 顶层棱块翻色（十字）',
    5: '⑤ 顶层角块翻色',
    6: '⑥ 顶层角块归位',
    7: '⑦ 顶层棱块归位'
  };
  const LG_SEC_NOTE = {
    2: '先决：<b>底面十字已好</b>（D 四条棱归位）。把角块转到<b>右下前槽正上方</b>，按它朝上的颜色选卡片。“黄”= 底面那个颜色。',
    3: '先决：<b>D 面全同色</b> + <b>第一层侧面下排同色</b>（F/R/L/B 的 7~9）。看当前状态命中哪条，按卡片公式做。',
    4: '先决：D 面全同色 + 第一层下排同色 + <b>第二层中排同色</b>（F/R/L/B 的 4~6）。按顶面棱块排布选：一字 / L 形 / 点。',
    5: '先决：同上（前两层已好），且顶面十字已成、四个角还没全朝上。',
    6: '先决：前两层已好 + <b>顶面 U.1~U.9 全同色</b>，四个角位置还没对。',
    7: '先决：前两层已好 + 顶面全同色 + 四个顶角已归位，只剩棱块。'
  };

  /* 卡片缩略图：把每格颜色按真实物理位置放进 isoCube 用的表 */
  function lgAppRC(fk, p) {
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      const q = FACE_CELL[fk](r, c);
      if (q[0] === p[0] && q[1] === p[1] && q[2] === p[2]) return [r, c];
    }
    return null;
  }
  function lgDiagram(c) { return lgDiagramCells(c.cells); }
  function lgDiagramCells(cells) {
    const d = { py: [[null,null,null],[null,null,null],[null,null,null]],
                pz: [[null,null,null],[null,null,null],[null,null,null]],
                px: [[null,null,null],[null,null,null],[null,null,null]] };
    for (const cell of cells) {
      const face = cell[0][0], idx = Number(cell[0].slice(2)) - 1;
      const fk = LG_FACE_OF[face];
      if (fk !== 'py' && fk !== 'pz' && fk !== 'px') continue;   // 只画可见三面
      const p = lgCellPos(face, Math.floor(idx / 3), idx % 3);
      const rc = lgAppRC(fk, p);
      if (rc) d[fk][rc[0]][rc[1]] = LG_HEX[cell[1]];
    }
    return d;
  }

  /* 每步做完后的典型样子（用后图）。灰格不画。 */
  const U9A = [['U.1','a'],['U.2','a'],['U.3','a'],['U.4','a'],['U.5','a'],['U.6','a'],['U.7','a'],['U.8','a'],['U.9','a']];
  const LG_AFTER = {
    3: [['U.5','a'],['F.5','b'],['R.5','c'],['F.6','b'],['R.4','c']],
    4: [['U.5','a'],['U.2','a'],['U.4','a'],['U.6','a'],['U.8','a']],
    5: U9A,
    6: U9A.concat([['F.1','b'],['F.3','b'],['R.1','c'],['R.3','c'],['L.1','d'],['L.3','d'],['B.1','e'],['B.3','e']]),
    7: U9A.concat([['F.1','b'],['F.2','b'],['F.3','b'],['F.4','b'],['F.5','b'],['F.6','b'],['F.7','b'],['F.8','b'],['F.9','b'],
                   ['R.1','c'],['R.2','c'],['R.3','c'],['R.4','c'],['R.5','c'],['R.6','c'],['R.7','c'],['R.8','c'],['R.9','c']])
  };

  /* 把「进阶」那种 d 图（物理位置的字母色）转成层先法的 [代号, 符号] 列表 */
  function lgFromDiagram(d) {
    const letterOf = {};
    for (const k in LG_HEX) letterOf[LG_HEX[k]] = k;
    const out = [], seen = {};
    for (const f of CELL_FACES) {
      const rows = d && d[f];
      if (!rows) continue;
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
        const v = rows[r][c];
        if (!v) continue;
        const p = FACE_CELL[f](r, c);
        let code = null;
        for (const fc in LG_FACE_OF) {
          if (LG_FACE_OF[fc] !== f) continue;      // 只看同一面，避免同一位置多个面的代号
          for (let rr = 0; rr < 3; rr++) for (let cc = 0; cc < 3; cc++) {
            const q = lgCellPos(fc, rr, cc);
            if (q[0] === p[0] && q[1] === p[1] && q[2] === p[2]) code = fc + '.' + (rr * 3 + cc + 1);
          }
        }
        if (code && !seen[code] && letterOf[v]) { seen[code] = 1; out.push([code, letterOf[v]]); }
      }
    }
    return out;
  }

  /* 缩略图代号：App 编号 -> 层先法编号（小写）。延迟构建，等 FACE_CELL 就绪 */
  let LG_TAGS = null;
  function lgTags() {
    if (LG_TAGS) return LG_TAGS;
    LG_TAGS = {};
    for (const f of CELL_FACES) {
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
        const appCode = CELL_TAG[f] + '.' + (r * 3 + c + 1);
        const p = FACE_CELL[f](r, c);
        let label = null;
        for (const fc in LG_FACE_OF) {
          if (LG_FACE_OF[fc] !== f) continue;
          for (let rr = 0; rr < 3; rr++) for (let cc = 0; cc < 3; cc++) {
            const q = lgCellPos(fc, rr, cc);
            if (q[0] === p[0] && q[1] === p[1] && q[2] === p[2]) label = fc.toLowerCase() + '.' + (rr * 3 + cc + 1);
          }
        }
        if (label) LG_TAGS[appCode] = label;
      }
    }
    return LG_TAGS;
  }

  /* 层先法匹配：a~f = 六个中心色；k = 先转几次 U 对齐 */
  function lgCellOK(cell, k) {
    const face = cell[0][0], idx = Number(cell[0].slice(2)) - 1;
    let p = lgCellPos(face, Math.floor(idx / 3), idx % 3);
    let fk = LG_FACE_OF[face];
    if (idx !== 4) {                        // 中心格不随 U 转
      p = lgRotV(p, -k);
      fk = vecKey(lgRotV(LG_FACE_VEC[face], -k));
    }
    const cu = findCubieStd(p[0], p[1], p[2]);
    return !!(cu && cu.colors[orientFace(fk)] === COLORS[LG_REF[cell[1]]]);
  }
  function lgMatch(c, k) {
    for (const cell of c.cells) if (!lgCellOK(cell, k)) return false;
    if (c.neg) {                            // 反向条件：这些格子不能全部对上
      let all = true;
      for (const cell of c.neg) if (!lgCellOK(cell, k)) { all = false; break; }
      if (all) return false;
    }
    return true;
  }
  function lgStageOK(step) {
    const p = lgPre();
    if (step === 2) return bottomCrossOK() && !p.l1;   // ②：底面十字好了、第一层还没完
    if (!p.dAll || !p.l1) return false;      // 先决：D 面全同色 + 第一层侧面下排同色
    if (step === 3) return !p.l2;            // ③：第二层还没好
    if (!p.l2) return false;                 // ④⑤⑥⑦：第二层侧面中排同色
    if (step === 4) return !crossOriented(); // ④：顶面十字还没成
    if (step === 5) return crossOriented() && !p.uAll;   // ⑤：十字好了但顶面未全色
    if (!p.uAll) return false;               // ⑥⑦：顶面 U.1~U.9 全同色
    if (step === 6) return !uCornersRelative();  // ⑥：角块还没相对归位
    if (step === 7) return uCornersRelative();   // ⑦：角块已相对归位，只剩棱
    return false;
  }

  /* 逐面读 9 格颜色（层先法编号，只用于“整排同色”这种对称判断） */
  function lgFaceColors(face) {
    const out = [];
    const fk = orientFace(LG_FACE_OF[face]);
    for (let i = 0; i < 9; i++) {
      const p = lgCellPos(face, Math.floor(i / 3), i % 3);
      const cu = findCubieStd(p[0], p[1], p[2]);
      out.push(cu ? cu.colors[fk] : null);
    }
    return out;
  }
  function lgUniform(face, idxs) {
    const cs = lgFaceColors(face);
    const first = cs[idxs[0]];
    if (!first) return false;
    for (const i of idxs) if (cs[i] !== first) return false;
    return true;
  }
  const ALL9 = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  function lgPre() {
    return {
      dAll: lgUniform('D', ALL9),
      l1: ['F', 'R', 'L', 'B'].every(function (f) { return lgUniform(f, [6, 7, 8]); }),
      l2: ['F', 'R', 'L', 'B'].every(function (f) { return lgUniform(f, [3, 4, 5]); }),
      uAll: lgUniform('U', ALL9)
    };
  }

  /* 角朝向再校一道：扭转签名（与角块排列、整体朝向无关） */
  function lgSameTw(c) {
    if (!c.tw) return true;
    const live = twistSigLive();
    for (let k = 0; k < 4; k++) {
      let ok = true;
      for (let i = 0; i < 4; i++) if (live[(i + k) % 4] !== c.tw[i]) { ok = false; break; }
      if (ok) return true;
    }
    return false;
  }
  function findAlignLayer(c) {
    if (!lgStageOK(c.step)) return -1;
    if (!lgSameTw(c)) return -1;
    for (let k = 0; k < 4; k++) if (lgMatch(c, k)) return k;
    return -1;
  }

  const SEC_TITLE = {
    1: '① 底层十字（公式一）',
    2: '② 底层角块（公式二）',
    3: '③ 中层棱块（公式三）',
    4: '④ 顶层十字（公式四）',
    5: '⑤ 顶面全色（公式五·小鱼）',
    6: '⑥ 顶层角块归位（公式六）',
    7: '⑦ 顶层棱块归位（公式七）'
  };
  const SEC_NOTE = {
    1: '没有公式，用「小花」法（本页是<b>白顶黄底</b>）：<br>' +
       '1. 白色中心朝上，把 4 个带黄色的棱块都转到顶面，围着白心摆成一朵「小黄花」；<br>' +
       '2. 转顶层，让某个棱块的侧面颜色和同色的侧面中心块对齐；<br>' +
       '3. 那个侧面对着自己，转 180°（转两下），棱块就落到底面，黄色朝下；<br>' +
       '4. 另外三个同样处理，最后底面是黄十字、四个侧面颜色都对上中心块。<br>' +
       '如果棱块已经在底面、但侧面颜色对不上：先把它转回顶层，再按上面重来。',
    2: '角块已经在底层、但黄色没朝下：先做一次 R U R\' 把它请到顶层，再按上面三种情况处理。',
    3: '目标棱块卡在中间层、位置或方向不对：在那个槽位做一次「右插」把它挤到顶层，再按上面两种情况处理。',
    5: '7 种全部收录。找不到完全一样的形态时：先转一下 U 再对照，最多转 3 次（每次多转一格）。',
    6: '如果四个角块全都位置不对（两对对角互换，E 型），本图册暂时没收录；先随便做一次 Aa 或 Ab，再回来重新对照。'
  };
  const GAL_COLOR = { W: '#f8fafc', Y: '#facc15', G: '#22c55e', R: '#ef4444', B: '#3b82f6', P: '#A600C7' };

  /* ================= 27 格坐标代号 =================
     U.1~U.9 / F.1~F.9 / R.1~R.9，每个面按「左上→右下」编号（U 面的第 1 行靠前）。 */
  const CELL_FACES = ['py', 'pz', 'px'];
  const CELL_TAG = { py: 'U', pz: 'F', px: 'R' };
  const LETTER_OF = { px: 'R', nx: 'P', py: 'W', ny: 'Y', pz: 'G', nz: 'B' };
  const HEX_LETTER = {};
  for (const f of FACES) HEX_LETTER[COLORS[f.key]] = LETTER_OF[f.key];

  /* 把 3x3 字母表压缩成「相对色符号」：
     a = U 心色，b = F 心色，c = R 心色，其余新颜色按出现顺序记作 d e f …
     灰格(null)直接跳过 —— 不参与比对，也省算力。 */
  const CENTER_LETTER = { py: 'W', pz: 'G', px: 'R' };   // 只画一个面时补回另外两个中心色
  const CENTER_CODE = ['U.5', 'F.5', 'R.5'];            // 三个中心格：分别记 a b c
  const CODE_FACE = { U: 'py', F: 'pz', R: 'px' };

  /* 代号 -> (面, 行, 列) */
  const CELL_MAP = {};
  for (const f of CELL_FACES) {
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      CELL_MAP[CELL_TAG[f] + '.' + (r * 3 + c + 1)] = [f, r, c];
    }
  }

  /* 把一个「有序的 (代号, 颜色) 列表」压成 a/b/c/d… ：
     先让 U.5/F.5/R.5 的颜色占 a/b/c，其余颜色按列表顺序依次记 d e f …
     图例和当前魔方都走这一套，比对的就是「同一位置上是不是同一个符号」。 */
  function buildSymbols(list) {
    const map = {}, out = {};
    for (let i = 0; i < 3; i++) {
      const code = CENTER_CODE[i];
      let col = null;
      for (const it of list) if (it.code === code && it.color) { col = it.color; break; }
      if (!col) col = CENTER_LETTER[CODE_FACE[CENTER_CODE[i][0]]];
      if (col && !(col in map)) map[col] = 'abc'[i];
    }
    let n = 0;
    for (const it of list) {
      if (!it.color) continue;
      if (!(it.color in map)) map[it.color] = 'def'[n++] || 'z';
      out[it.code] = map[it.color];
    }
    return out;
  }

  /* 图例：把图上的非灰格按顺序列出来 */
  function caseList(d) {
    const list = [];
    for (const f of CELL_FACES) {
      const rows = d && d[f];
      if (!rows) continue;
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
        const v = rows[r][c];
        if (v) list.push({ code: CELL_TAG[f] + '.' + (r * 3 + c + 1), color: v });
      }
    }
    return list;
  }

  /* 当前魔方：读同一个代号位置上的颜色 */
  function liveColorAt(code) {
    const m = CELL_MAP[code];
    if (!m) return null;
    const p = FACE_CELL[m[0]](m[1], m[2]);
    const cu = findCubieStd(p[0], p[1], p[2]);
    return (cu && cu.colors[m[0]]) ? (HEX_LETTER[cu.colors[m[0]]] || null) : null;
  }

  /* 位置在顶层转 k 次后的位置（U 转） */
  function uRotPos(p, k) {
    let x = p[0], z = p[2];
    const n = ((k % 4) + 4) % 4;
    for (let i = 0; i < n; i++) { const nx = -z, nz = x; x = nx; z = nz; }
    return [x, p[1], z];
  }

  function liveColorAtRot(code, k) {
    const m = CELL_MAP[code];
    if (!m) return null;
    const q = FACE_CELL[m[0]](m[1], m[2]);
    const p = uRotPos(q, -k);                       // 标准坐标里的预转
    const cu = findCubieStd(p[0], p[1], p[2]);      // ← 改
    const fk = orientFace(m[0]);                    // ← 改
    return (cu && cu.colors[fk]) ? (HEX_LETTER[cu.colors[fk]] || null) : null;
  }

  /* 判定：图例规则 vs 当前状态（灰格不在 order 里，天然跳过） */
  function caseMatches(c, k) {
    const kk = k || 0;
    if (!kk) {
      const live0 = buildSymbols(c.order.map(function (code) { return { code: code, color: liveColorAt(code) }; }));
      for (const code in c.rule) if (live0[code] !== c.rule[code]) return false;
      return true;
    }
    const live = buildSymbols(c.order.map(function (code) { return { code: code, color: liveColorAtRot(code, kk) }; }));
    for (const code in c.rule) if (live[code] !== c.rule[code]) return false;
    return true;
  }
  /* 顶面 4 角「扭转签名」：0=朝上，±1=朝侧面（手性已校正，与配色/角块置换无关） */
   function twistSigLive() {
    const order = [[1, 1, 1], [-1, 1, 1], [-1, 1, -1], [1, 1, -1]];
    const upF = orientFace('py');
    return order.map(function (p) {
      const cu = findCubieStd(p[0], p[1], p[2]);
      if (!cu) return 0;
      if (cu.colors[upF] === COLORS.py) return 0;
      const kx = orientFace(p[0] > 0 ? 'px' : 'nx');
      const kz = orientFace(p[2] > 0 ? 'pz' : 'nz');
      const flip = (p[0] * p[2] < 0) ? -1 : 1;
      if (cu.colors[kx] === COLORS.py) return -1 * flip;
      if (cu.colors[kz] === COLORS.py) return 1 * flip;
      return 0;
    });
  }

  function crossOriented() {
    const e = [[0, 1, 1], [0, 1, -1], [-1, 1, 0], [1, 1, 0]];
    const upF = orientFace('py');
    for (const p of e) {
      const cu = findCubieStd(p[0], p[1], p[2]);
      if (!cu || cu.colors[upF] !== COLORS.py) return false;
    }
    return true;
  } 


  /* ---------- 阶段前置条件：前面没做完就不判后面的形态 ---------- */
  const B_D_EDGE = [[0, -1, 1, ['ny', 'pz']], [0, -1, -1, ['ny', 'nz']], [1, -1, 0, ['ny', 'px']], [-1, -1, 0, ['ny', 'nx']]];
  const B_D_CORNER = [[1, -1, 1, ['ny', 'px', 'pz']], [-1, -1, 1, ['ny', 'nx', 'pz']],
                      [1, -1, -1, ['ny', 'px', 'nz']], [-1, -1, -1, ['ny', 'nx', 'nz']]];
  const B_MID = [[1, 0, 1, ['px', 'pz']], [1, 0, -1, ['px', 'nz']], [-1, 0, 1, ['nx', 'pz']], [-1, 0, -1, ['nx', 'nz']]];

  function blockOK(b) {
    const cu = findCubieStd(b[0], b[1], b[2]);
    if (!cu) return false;
    for (let i = 0; i < b[3].length; i++) {
      const k = b[3][i];
      if (cu.colors[orientFace(k)] !== COLORS[k]) return false;
    }
    return true;
  }
  function bottomCrossOK() {
    for (const b of B_D_EDGE) if (!blockOK(b)) return false;
    return true;
  }
  function firstLayerOK() {
    if (!bottomCrossOK()) return false;
    for (const b of B_D_CORNER) if (!blockOK(b)) return false;
    return true;
  }
  function twoLayersOK() {
    if (!firstLayerOK()) return false;
    for (const b of B_MID) if (!blockOK(b)) return false;
    return true;
  }

  function topFaceOK() {
    if (!twoLayersOK()) return false;
    const upF = orientFace('py');                              // ← 改
    for (const p of [[1,1,1],[-1,1,1],[1,1,-1],[-1,1,-1],[0,1,1],[0,1,-1],[-1,1,0],[1,1,0],[0,1,0]]) {
      const cu = findCubieStd(p[0], p[1], p[2]);               // ← 改
      if (!cu || cu.colors[upF] !== COLORS.py) return false;   // ← 改
    }
    return true;
  }

  /* 当前进行到第几步：前面没做完，就不会出现后面的形态 */
  function uCornersPlaced() {
    const list = [[1, 1, 1, ['px', 'py', 'pz']], [-1, 1, 1, ['nx', 'py', 'pz']],
                  [1, 1, -1, ['px', 'py', 'nz']], [-1, 1, -1, ['nx', 'py', 'nz']]];
    for (const b of list) if (!blockOK(b)) return false;
    return true;
  }
  function currentStage() {
    if (!bottomCrossOK()) return 1;
    if (!firstLayerOK()) return 2;
    if (!twoLayersOK()) return 3;
    if (!crossOriented()) return 4;
    if (!topFaceOK()) return 5;
    if (!uCornersRelative()) return 6;
    return 7;
  }
    /* 角块「相对归位」：允许整体转 U，只要每个顶角的三种颜色集合
     等于它所在位置的三个面颜色集合。顶面全色已保证角块没有翻转。 */
  function uCornersRelative() {
    const list = [
      [1, 1, 1, ['px', 'py', 'pz']], [-1, 1, 1, ['nx', 'py', 'pz']],
      [1, 1, -1, ['px', 'py', 'nz']], [-1, 1, -1, ['nx', 'py', 'nz']]
    ];
    for (const b of list) {
      const cu = findCubieStd(b[0], b[1], b[2]);              // ← 用 Std
      if (!cu) return false;
      const want = b[3].map(k => COLORS[k]).sort().join(',');
      const got = b[3].map(k => cu.colors[orientFace(k)]).filter(Boolean).sort().join(',');  // ← orientFace
      if (want !== got) return false;
    }
    return true;
  }


  function stageReady(step, stage) {
    if (step === 4) return stage === 4 || stage === 5;   // 「十字→小鱼」也算这一档
    return step === stage;
  }

  /* 返回需要先转几次 U 才能命中（0~3），-1 = 不匹配 */
  function findAlign(c) {
    if (!stageReady(c.step, currentStage())) return -1;
    /* ⑤ 顶面角朝向：只比「四个角怎么扭转」，角块怎么排、整体怎么转都不影响 */
    if (c.tw && c.tw.length === 4) {
      if (!crossOriented()) return -1;
      const live = twistSigLive();
      for (let k = 0; k < 4; k++) {
        let ok = true;
        for (let i = 0; i < 4; i++) if (live[(i + k) % 4] !== c.tw[i]) { ok = false; break; }
        if (ok) return 0;
      }
      return -1;
    }
    for (let k = 0; k < 4; k++) if (caseMatches(c, k)) return k;
    return -1;
  }

  function caseMatchesOld(c) {
    const live = buildSymbols(c.order.map(function (code) {
      return { code: code, color: liveColorAt(code) };
    }));
    for (const code in c.rule) {
      if (live[code] !== c.rule[code]) return false;
    }
    return true;
  }

  /* ================= 小魔方：等轴测 + 透视（近大远小） ================= */
  const ISO_YAW = -34, ISO_PITCH = -24, ISO_DIST = 6;   // 距离越小透视越强
  const GRAY_CELL = '#26344a', GRAY_EDGE = '#334155';

  function isoCube(d, size, mv, vx, vy, codes, bars) {
    const S = size || 42;
    const pitch = (typeof vx === 'number') ? vx : ISO_PITCH;
    const yaw = (typeof vy === 'number') ? vy : ISO_YAW;
    const ax = pitch * Math.PI / 180, ay = yaw * Math.PI / 180;
    const cx = Math.cos(ax), sx = Math.sin(ax), cy = Math.cos(ay), sy = Math.sin(ay);
    /* 与主魔方同一个视角矩阵（先绕 Y、再绕 X），y 取反是为了配合 CSS 的 y 向下 */
    const M = [[cy, 0, sy], [sx * sy, cx, -sx * cy], [-cx * sy, sx, cx * cy]];

    function project(x, y, z) {
      const vx = M[0][0] * x + M[0][1] * (-y) + M[0][2] * z;
      const vy = M[1][0] * x + M[1][1] * (-y) + M[1][2] * z;
      const vz = M[2][0] * x + M[2][1] * (-y) + M[2][2] * z;
      const k = ISO_DIST / (ISO_DIST - vz);      // ← 透视缩放：前面大、后面小
      return [vx * k * S, vy * k * S, vz];
    }

    const at = function (f, r, c) { return (d && d[f] && d[f][r]) ? d[f][r][c] : null; };
    const quads = [];
    function push(corners, color, code) {
      const P = corners.map(function (p) { return project(p[0], p[1], p[2]); });
      let mx = 0, my = 0, mz = 0;
      for (const p of P) { mx += p[0] / 4; my += p[1] / 4; mz += p[2] / 4; }
      // 去掉了以前的 0.94 屏幕缩放，因为我们在 3D 空间用 gap 做好了留缝
      quads.push({ p: P, c: (color && (GAL_COLOR[color] || color === 'X')) ? (color === 'X' ? '#f59e0b' : GAL_COLOR[color]) : GRAY_CELL, code: code, z: mz });
    }

    /* 六个面的外法向：用视图矩阵投一下，z > 0 就是朝向观察者的那三个面 */
    const FACE_N = {
      py: [0, 1, 0], ny: [0, -1, 0],
      pz: [0, 0, 1], nz: [0, 0, -1],
      px: [1, 0, 0], nx: [-1, 0, 0]
    };
    const visible = {};
    for (const ff in FACE_N) {
      const nn = FACE_N[ff];
      if (project(nn[0], nn[1], nn[2])[2] > 1e-6) visible[ff] = true;
    }
    /* 每个面 (r,c) 格的四个 3D 角；编号与 FACE_CELL 一致 */
    function faceQuads(f, r, c) {
      // 在 3D 空间里留出缝隙，这样透视投影会自动计算近大远小的透视变形
      const gap = 0.02; 
      const u0 = c / 3 - 0.5 + gap, u1 = (c + 1) / 3 - 0.5 - gap;
      const v1 = 0.5 - r / 3 - gap, v0 = 0.5 - (r + 1) / 3 + gap;
      
      switch (f) {
        case 'py': return [[u0, 0.5, v1], [u1, 0.5, v1], [u1, 0.5, v0], [u0, 0.5, v0]];
        case 'ny': return [[u0, -0.5, -v0], [u1, -0.5, -v0], [u1, -0.5, -v1], [u0, -0.5, -v1]];
        case 'pz': return [[u0, v1, 0.5], [u1, v1, 0.5], [u1, v0, 0.5], [u0, v0, 0.5]];
        case 'nz': return [[-u1, v1, -0.5], [-u0, v1, -0.5], [-u0, v0, -0.5], [-u1, v0, -0.5]];
        
        // ★ 核心修复：px 的 z 坐标应为 u0 和 u1（以前错写成了 -u0 和 -u1）
        case 'px': return [[0.5, v1, u0], [0.5, v1, u1], [0.5, v0, u1], [0.5, v0, u0]];
        
        case 'nx': return [[-0.5, v1, -u0], [-0.5, v1, -u1], [-0.5, v0, -u1], [-0.5, v0, -u0]];
      }
      return null;
    }

    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const n = r * 3 + c + 1;
        if (visible.py) push(faceQuads('py', r, c), at('py', r, c), 'U.' + n);
        if (visible.pz) push(faceQuads('pz', r, c), at('pz', r, c), 'F.' + n);
        if (visible.px) push(faceQuads('px', r, c), at('px', r, c), 'R.' + n);
        if (visible.ny) push(faceQuads('ny', r, c), at('ny', r, c), 'D.' + n);
        if (visible.nz) push(faceQuads('nz', r, c), at('nz', r, c), 'B.' + n);
        if (visible.nx) push(faceQuads('nx', r, c), at('nx', r, c), 'L.' + n);
      }
    }

    /* 这一层往哪转：绕轴 a 的圆弧箭头 */
    let arcPts = null;
    if (mv) {
      const AI = { x: 0, y: 1, z: 2 };
      const idx = AI[mv.axis];
      const a = [0, 0, 0]; a[idx] = 1;
      const u0 = mv.axis === 'x' ? [0, 0, 1] : [1, 0, 0];
      const v0 = [
        a[1] * u0[2] - a[2] * u0[1],
        a[2] * u0[0] - a[0] * u0[2],
        a[0] * u0[1] - a[1] * u0[0]
      ];
      const c = [0, 0, 0]; c[idx] = mv.layer * 0.5;   // 层在立方体坐标里是 ±0.5
      const R = 0.78;
      const at = function (t) {
        const ca = Math.cos(t), sa = Math.sin(t);
        return [
          c[0] + R * (u0[0] * ca + v0[0] * sa),
          c[1] + R * (u0[1] * ca + v0[1] * sa),
          c[2] + R * (u0[2] * ca + v0[2] * sa)
        ];
      };
      let bestT = 0, bestZ = -1e9;
      for (let k = 0; k < 120; k++) {
        const t = k / 120 * Math.PI * 2;
        const p = at(t);
        const q = project(p[0], p[1], p[2]);
        if (q[2] > bestZ) { bestZ = q[2]; bestT = t; }
      }
      const span = 54 * Math.PI / 180;
      const dir = mv.angle > 0 ? 1 : -1;
      arcPts = [];
      for (let k = 0; k <= 20; k++) {
        const t = bestT + dir * (k / 20 * 2 - 1) * span;
        const p = at(t);
        const q = project(p[0], p[1], p[2]);
        arcPts.push([q[0], q[1]]);
      }
    }

    /* ⑦ 用前图：在背面 / 左面对边补一条三段粗短线，表示看不见的 B/L 格子颜色 */
    if (bars) {
      const y = 0.54, w = 0.17;
      for (let i = 0; i < 3; i++) {
        const x0 = -0.5 + i / 3, x1 = x0 + 1 / 3;
        push([[x0, y, -0.52], [x1, y, -0.52], [x1, y, -0.52 - w], [x0, y, -0.52 - w]],
             LG_HEX[bars.B[2 - i]], 'B.' + (3 - i));
      }
      for (let i = 0; i < 3; i++) {
        const z0 = 0.5 - i / 3, z1 = z0 - 1 / 3;
        push([[-0.52, y, z0], [-0.52, y, z1], [-0.52 - w, y, z1], [-0.52 - w, y, z0]],
             LG_HEX[bars.L[i]], 'L.' + (i + 1));
      }
    }

    // ★ 加入深度排序：按 z 值从小到大（先画远处，后画近处）
    quads.sort(function (a, b) { return a.z - b.z; });

    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    if (arcPts) for (const p of arcPts) { minX = Math.min(minX, p[0]); minY = Math.min(minY, p[1]); maxX = Math.max(maxX, p[0]); maxY = Math.max(maxY, p[1]); }
    for (const q of quads) for (const p of q.p) {
      if (p[0] < minX) minX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] > maxY) maxY = p[1];
    }
    const pad = 2;
    const Wd = Math.ceil(maxX - minX + pad * 2), Ht = Math.ceil(maxY - minY + pad * 2);
    let svg = '<svg class="iso" viewBox="0 0 ' + Wd + ' ' + Ht + '" width="' + Wd + '" height="' + Ht + '">';
    for (const q of quads) {
      const pts = q.p.map(function (p) {
        return (p[0] - minX + pad).toFixed(1) + ',' + (p[1] - minY + pad).toFixed(1);
      }).join(' ');
      svg += '<polygon points="' + pts + '" fill="' + q.c + '" stroke="' + GRAY_EDGE +
        '" stroke-width="0.7">' + (mv ? '' : '<title>' + ((codes && codes[q.code]) || q.code) + '</title>') + '</polygon>';
    }
    if (arcPts) {
      const toXY = function (p) { return (p[0] - minX + pad).toFixed(1) + ',' + (p[1] - minY + pad).toFixed(1); };
      const linePts = arcPts.map(toXY).join(' ');
      
      // ★ 1. 线条底色（加粗一点，深色描边更立体）
      svg += '<polyline points="' + linePts + '" fill="none" stroke="#0b1120" stroke-width="5.0" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>';
      // ★ 2. 线条主色：改为醒目的亮青色 #00e5ff（你也可以换成亮红 #ef4444）
      svg += '<polyline points="' + linePts + '" fill="none" stroke="#00e5ff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>';
      
      const p2 = arcPts[arcPts.length - 1], p1 = arcPts[arcPts.length - 2];
      const dx = p2[0] - p1[0], dy = p2[1] - p1[1];
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len;
      const nx = -uy, ny = ux;
      
      // ★ 3. 把箭头头部放大（原来 h=5.2, 比例 0.62，现在改为 h=9.5, 比例 0.85）
      const h = 9.5;
      const tip = [p2[0] + ux * 2.5, p2[1] + uy * 2.5]; // 尖端往外延展一点
      const b1 = [p2[0] - ux * h + nx * h * 0.85, p2[1] - uy * h + ny * h * 0.85];
      const b2 = [p2[0] - ux * h - nx * h * 0.85, p2[1] - uy * h - ny * h * 0.85];
      
      // ★ 4. 箭头填充色与线条一致
      svg += '<polygon points="' + [tip, b1, b2].map(function (p) {
        return (p[0] - minX + pad).toFixed(1) + ',' + (p[1] - minY + pad).toFixed(1);
      }).join(' ') + '" fill="#00e5ff"/>';
    }
    return svg + '</svg>';
  }

  /* 把字母表里的颜色按 map 替换（没命中就传 null，原样显示） */
  function remapDiagram(d, map) {
    if (!map) return d;
    const out = {};
    for (const f in d) {
      out[f] = d[f].map(function (row) {
        return row.map(function (v) { return (v && map[v]) ? map[v] : v; });
      });
    }
    return out;
  }

  function baHTML(c, map) {
    const codes = (activeSet === 'layer') ? lgTags() : null;
    const before = '<div class="ba-col"><span class="ba-lbl">用前</span>' + isoCube(remapDiagram(c.d, map), 50, null, undefined, undefined, codes, c.bars) + '</div>';
    if (!c.d2) return before;
    return before +
      '<div class="ba-arrow">→</div>' +
      '<div class="ba-col"><span class="ba-lbl">用后</span>' + isoCube(remapDiagram(c.d2, map), 50, null, undefined, undefined, codes) + '</div>';
  }

  function buildCase(c) {
    const el = document.createElement('div');
    el.className = 'case';
    el.dataset.i = String(activeGallery().indexOf(c));

    const ba = document.createElement('div');
    ba.className = 'ba';
    ba.innerHTML = baHTML(c, null);
    el.appendChild(ba);

    const info = document.createElement('div');
    info.className = 'ci';
    let html = '<div class="cn">' + c.name + '<em class="hit-tag">当前适用</em></div>';
    html += '<div class="ca"><span class="alg-txt">' + c.alg + '</span>' +
      '<button class="alg-run" title="按这条公式演示一遍（不用先命中）">▶</button>' +
      '<button class="alg-rev" title="把这个公式反过来做一遍（回到命中时的状态）">↩</button></div>';
    if (c.hint) html += '<div class="ch">' + c.hint + '</div>';
    info.innerHTML = html;
    const runBtn = info.querySelector('.alg-run');
    if (runBtn) runBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      confirmThenStart(c, 0);
    });
    const rev = info.querySelector('.alg-rev');
    if (rev) rev.addEventListener('click', function (e) {
      e.stopPropagation();
      revertFormula(c);
    });
    el.appendChild(info);
    return el;            // ★ 补这一行
  }

  /* 卡片上的「↩」：把这个公式从右到左、反方向再做一遍，回到命中时的状态 */
  function revertFormula(c) {
    if (!c || !c.alg) return;
    cancelMatch();
    if (runCase) { autoArmed = false; stopRun(); }
    holdMatch = true;
    const toks = expandAlg(c.alg.split(' ').filter(Boolean));
    for (let k = toks.length - 1; k >= 0; k--) {
      const mv = parseMove(toks[k]);
      pushTurn(mv.axis, mv.layer, -mv.angle, {
        ms: 150, runStep: true,
        onApplied: k === 0 ? function () { holdMatch = false; scheduleMatch(0); } : null
      });
    }
    /* 之前是靠先转 U 对齐才命中的，回退时也要把那几下转回来 */
    const pre = c.pre || 0;
    const upMv = parseMove('U');
    for (let i = 0; i < pre; i++) {
      pushTurn(upMv.axis, upMv.layer, -upMv.angle, { ms: 150, runStep: true, undoStep: true });
    }
  }


  for (const c of GALLERY) {
    const list = caseList(c.d);
    c.order = list.map(function (it) { return it.code; });
    c.rule = buildSymbols(list);
    c.cells = {};
    for (const it of list) c.cells[it.code] = it.color;
  }

  /* 命中时：图例里的颜色 → 当前魔方对应位置的颜色 */
  function liveColorMap(c) {
    const map = {};
    if (c.cells && !c.order) {                       // 层先法卡片
      for (const cell of c.cells) {
        const face = cell[0][0], idx = Number(cell[0].slice(2)) - 1;
        let p = lgCellPos(face, Math.floor(idx / 3), idx % 3);
        let fk = LG_FACE_OF[face];
        if (idx !== 4) { p = lgRotV(p, -k0); fk = vecKey(lgRotV(LG_FACE_VEC[face], -k0)); }
        const cu = findCubieStd(p[0], p[1], p[2]);                          // ← 改
        const key = orientFace(fk);                                         // ← 改
        const to = cu && cu.colors[key] ? HEX_LETTER[cu.colors[key]] : null; // ← 改
        if (to) map[LG_HEX[cell[1]]] = to;
      }
      return map;
    }
    for (const code of c.order) {
      const from = c.cells[code], to = liveColorAt(code);                   // liveColorAt 已改
      if (from && to) map[from] = to;
    }
    return map;
  }

  let k0 = 0;

  /* ★ 新增：当前视角是否与公式基准（标准朝向）一致 */
  function viewAligned() {
    const u = screenFaceVec('U');
    const f = screenFaceVec('F');
    return u[0] === 0 && u[1] === 1 && u[2] === 0 &&
           f[0] === 0 && f[1] === 0 && f[2] === 1;
  }

  /* ★ 新增：执行前的确认流程 */
  let confirmPending = false;
  let confirmTimer = 0;
  function cancelConfirm() {
    confirmPending = false;
    clearTimeout(confirmTimer);
    confirmTimer = 0;
  }
  function confirmThenStart(c, k) {
    cancelConfirm();
    if (viewAligned()) { startRun(c, k); return; }
    confirmPending = true;
    galHitEl.className = 'gal-hit warn';
    galHitEl.innerHTML =
      '<div class="warn-line">⚠ 当前魔方朝向和公式基准不一致（已转体 90°/180°/270°），直接执行会和卡片图对不上</div>' +
      '<div class="warn-line">请再次确认是否执行（5 秒内有效）：</div>' +
      '<div class="warn-line">' +
        '<button id="galConfirmGo">▶ 确认执行</button>' +
        '<button id="galConfirmNo">取消</button>' +
      '</div>';
    document.getElementById('galConfirmGo').addEventListener('click', function () {
      cancelConfirm();
      startRun(c, k);
    });
    document.getElementById('galConfirmNo').addEventListener('click', function () {
      cancelConfirm();
      scheduleMatch(0);
    });
    confirmTimer = setTimeout(function () {
      confirmPending = false;
      confirmTimer = 0;
      scheduleMatch(0);          // 5 秒后恢复「当前适用…」提示
    }, 5000);
  }
  /* 匹配节流：自由转动时等一小会儿再匹配，避免每转一步就闪 */
  let matchTimer = 0;
  function scheduleMatch(delay) {
    clearTimeout(matchTimer);
    matchTimer = setTimeout(function () {
      matchTimer = 0;
      updateMatches();
    }, delay == null ? 180 : delay);
  }
  function cancelMatch() {
    clearTimeout(matchTimer);
    matchTimer = 0;
  }

  /* 用当前状态比对全部形态 */
  function updateMatches() {
    if (!galleryPanel.classList.contains('show') || !galHitEl) return;
    if (runCase || holdMatch) return;
    if (confirmPending) { cancelConfirm(); }   // ★ 状态已变，旧确认作废

    MATCH_ORIENT = computeOrient();
    try {
      const list = activeGallery();
      const hits = [];
      for (const c of list) {
        if (c.noMatch) continue;
        const k = activeSet === 'layer' ? findAlignLayer(c) : findAlign(c);
        if (k >= 0) hits.push({ c: c, k: k });
      }
      if (activeSet === 'layer') {
        hits.sort(function (a, b) { return b.c.cells.length - a.c.cells.length; });
      }
      const solved = isSolvedNow();
      const cards = galBody.querySelectorAll('.case');
      const hitNames = hits.map(function (h) { return h.c; });
      for (const card of cards) {
        const c = list[Number(card.dataset.i)];
        const hit = !solved && hitNames.indexOf(c) >= 0;
        const h = hits.find(function (x) { return x.c === c; });
        if (hit === card.classList.contains('hit')) continue;
        card.classList.toggle('hit', hit);
        k0 = h ? h.k : 0;
        card.querySelector('.ba').innerHTML = baHTML(c, hit ? liveColorMap(c) : null);
      }
      if (solved) {
        galHitEl.className = 'gal-hit none';
        galHitEl.textContent = '魔方已还原，没有需要执行的公式';
      } else if (!hits.length) {
        galHitEl.className = 'gal-hit none';
        galHitEl.textContent = activeSet === 'layer'
          ? '当前状态没命中（先确认上一步真的做完了；也可以先转一下 U 再对照）'
          : '当前状态没有匹配到图册里的形态（可能需要先转一下 U，换个朝向再对照）';
      } else if (autoArmed && activeSet !== 'layer' && viewAligned()) {
        startRun(hits[0].c, hits[0].k);
      } else {
        galHitEl.className = 'gal-hit';
        galHitEl.innerHTML = '当前适用 ' + hits.length + ' 条：' +
          hits.map(function (h) {
            return '第' + h.c.step + '步 · ' + h.c.name + (h.k ? '（先转 U' + (h.k === 1 ? '' : h.k === 2 ? '2' : '3') + '）' : '');
          }).join('　') +
          '<button class="gal-start" id="galStart">▶ 执行</button>';
        document.getElementById('galStart').addEventListener('click', function () { confirmThenStart(hits[0].c, hits[0].k); });
      }
    } finally {
      MATCH_ORIENT = null;
    }
  }

  /* ================= 公式执行：逐步展示「转哪层、往哪转」 ================= */
  let runCase = null, runIdx = 0, runTimer = 0, runPaused = false, autoArmed = true;
  let runMode = 'manual';          // manual = 自己转，auto = 自动转
  let holdMatch = false;           // 回退播放期间挂起比对
  let runHalf = null;              // 180° 转动分两次做时的中间状态

  function dirCube(m) {
    const idx = AXIS_INDEX[m.axis];
    const d = {};
    /* 6 个面都要标，isoCube 再按当前视角挑可见的三面来画 */
    for (const f of ['py', 'ny', 'pz', 'nz', 'px', 'nx']) {
      const rows = [[], [], []];
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          const p = FACE_CELL[f](r, c);
          rows[r][c] = (p[idx] === m.layer) ? 'X' : null;
        }
      }
      d[f] = rows;
    }
    return isoCube(d, 46, m, viewX, viewY);
  }

  function LAYER_NAME(mv) {
    if (mv.layer === 0) return '中层';
    const d = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }[mv.axis];
    const s = viewOf([d[0] * mv.layer, d[1] * mv.layer, d[2] * mv.layer]);
    if (mv.axis === 'y') return s[1] < 0 ? '上层 U' : '下层 D';
    if (mv.axis === 'x') return s[0] > 0 ? '右层 R' : '左层 L';
    return s[2] < 0 ? '前层 F' : '后层 B';
  }

  /* 转体（x/y/z）展开成「三层各转一次」，这样没有转体能力也能照做 */
  const ROT_EXPAND = {
    'y': ['U', "E'", "D'"], "y'": ["U'", 'E', 'D'], 'y2': ['U2', 'E2', 'D2'],
    'x': ['R', "M'", "L'"], "x'": ["R'", 'M', 'L'], 'x2': ['R2', 'M2', 'L2'],
    'z': ['F', 'S', "B'"], "z'": ["F'", "S'", 'B'], 'z2': ['F2', 'S2', 'B2']
  };
  function expandAlg(tokens) {
    const out = [];
    for (const t of tokens) {
      const e = ROT_EXPAND[t] || ROT_EXPAND[t.toLowerCase()];
      if (e) out.push.apply(out, e); else out.push(t);
    }
    return out;
  }

  let runPre = 0;
  let runParsed = [];                  // 开始执行时按当时视角定格下来的几何动作
  function runMoves() {
    if (!runCase) return [];
    const body = expandAlg(runCase.alg.split(' ').filter(Boolean));
    const pre = [];
    for (let i = 0; i < runPre; i++) pre.push('U');
    return pre.concat(body);
  }
  function parseRunMoves() {
    return runMoves().map(function (n) { return parseMove(n); });
  }

  function renderRun() {
    if (!runCase) return;
    const moves = runMoves();
    const name = moves[runIdx];
    const mv = runParsed[runIdx] || parseMove(name);
    galHitEl.className = 'gal-hit run';
    galHitEl.innerHTML =
      '<div class="run-dir">' + dirCube(mv) + '</div>' +
      '<div class="run-info">' +
        '<div class="run-name">' + runCase.name + ' · ' + (runIdx + 1) + '/' + moves.length + '</div>' +
        '<div class="run-mv">' + name + '<span class="run-layer">' + LAYER_NAME(mv) + '</span></div>' +
        '<div class="run-tip">' + (runMode === 'auto' ? '自动执行中…' : '请自己转动这一步，转对会自动进入下一步') + '</div>' +
      '</div>' +
      '<div class="run-btns">' +
        (runMode === 'auto'
          ? '<button id="runPause">' + (runPaused ? '继续' : '暂停') + '</button>'
          : '<button id="runSkip">跳过</button>') +
        '<button id="runStop">退出</button>' +
        '<button id="runPrev"' + (runIdx ? '' : ' disabled') + '>上一步</button>' +
        '<button id="runNext">下一步</button>' +
      '</div>';
    const pauseBtn = document.getElementById('runPause');
    if (pauseBtn) pauseBtn.addEventListener('click', function () {
      runPaused = !runPaused;
      clearTimeout(runTimer);
      renderRun();
      if (!runPaused) runTimer = setTimeout(stepRun, 600);
    });
    const skipBtn = document.getElementById('runSkip');
    if (skipBtn) skipBtn.addEventListener('click', function () { advanceRun(); });
    const prevBtn = document.getElementById('runPrev');
    if (prevBtn) prevBtn.addEventListener('click', prevStep);
    const nextBtn = document.getElementById('runNext');
    if (nextBtn) nextBtn.addEventListener('click', nextStep);
    document.getElementById('runStop').addEventListener('click', function () { stopRun(); });
  }

  function stepRun() {
    if (!runCase || runPaused) return;
    const moves = runMoves();
    if (runIdx >= moves.length) { stopRun(); return; }
    const idx = runIdx;
    const mv = runParsed[idx];
    if (!mv) { stopRun(); return; }
    pushTurn(mv.axis, mv.layer, mv.angle, {
      ms: 300, runStep: true,
      onApplied: function () {
        if (!runCase || runIdx !== idx) return;   // 期间被回退/退出了
        runIdx = idx + 1;
        if (runIdx >= moves.length) { finishRun(); return; }
        renderRun();
        runTimer = setTimeout(stepRun, 1000);
      }
    });
  }

  function startRun(c, k) {
    cancelConfirm();          // ★ 新增
    cancelMatch();
    stopRun(true);
    if (!c) return;
    /* 不再摆正视角：公式里的 U/D/L/R 按「你现在看到的那一面」解析，
       并在这里一次性定格成几何动作。 */
    runCase = c;
    runPre = k || 0;
    c.pre = runPre;
    runIdx = 0;
    runPaused = false;
    autoArmed = false;
    runHalf = null;
    runParsed = parseRunMoves();          // ★ 关键
    renderRun();
    if (runMode === 'auto') runTimer = setTimeout(stepRun, 1400);
  }

  function finishRun() {
    if (!runCase) return;
    clearTimeout(runTimer);
    runPaused = true;
    galHitEl.className = 'gal-hit run';
    galHitEl.innerHTML = '<div class="run-done">✅ 公式走完：' + runCase.name + '</div>' +
      '<div class="run-btns">' +
        '<button id="runPrev">上一步</button>' +
        '<button id="runStop">退出</button>' +
      '</div>';
    const pv = document.getElementById('runPrev');
    if (pv) pv.addEventListener('click', prevStep);
    document.getElementById('runStop').addEventListener('click', function () { stopRun(); });
    runTimer = setTimeout(function () { stopRun(); }, 8000);
  }

  /* 鼠标点「下一步」：替你把这一步转出来，再前进 */
  function nextStep() {
    if (!runCase) return;
    const moves = runMoves();
    if (runIdx >= moves.length) { finishRun(); return; }
    clearTimeout(runTimer);
    runPaused = true;
    const idx = runIdx;
    const mv = runParsed[idx];
    if (!mv) { finishRun(); return; }
    pushTurn(mv.axis, mv.layer, mv.angle, {
      ms: 260, runStep: true,
      onApplied: function () {
        if (!runCase || runIdx !== idx) return;
        runIdx = idx + 1;
        if (runIdx >= moves.length) { finishRun(); return; }
        renderRun();
      }
    });
  }

  /* 鼠标点「上一步」：把刚才做的那一步反着转回去 */
  function prevStep() {
    if (!runCase || runIdx === 0) return;
    clearTimeout(runTimer);
    runPaused = true;
    const mv = runParsed[runIdx - 1];
    if (!mv) return;
    runIdx--;
    runHalf = null;
    pushTurn(mv.axis, mv.layer, -mv.angle, { ms: 200, undoStep: true, runStep: true });
    renderRun();
  }

  function advanceRun() {
    if (!runCase) return;
    runIdx++;
    if (runIdx >= runMoves().length) { finishRun(); return; }
    runHalf = null;
    renderRun();
  }

  /* 手动模式：监听用户自己转的那一步 */
  function onUserMove(m) {
    if (!runCase || runMode !== 'manual') return;
    const want = runParsed[runIdx];
    if (!want) return;
    if (runHalf) {
      const okHalf = m.axis === runHalf.axis && m.layer === runHalf.layer &&
        Math.abs(m.angle) === 90 && Math.sign(m.angle) === runHalf.sign;
      runHalf = null;
      if (okHalf) advanceRun();
      return;
    }
    if (m.axis === want.axis && m.layer === want.layer && m.angle === want.angle) { advanceRun(); return; }
    if (Math.abs(want.angle) === 180 && m.axis === want.axis && m.layer === want.layer &&
        Math.abs(m.angle) === 90 && Math.sign(m.angle) === Math.sign(want.angle)) {
      runHalf = { axis: m.axis, layer: m.layer, sign: Math.sign(m.angle) };
    }
  }

  function stopRun(silent) {
    clearTimeout(runTimer);
    runTimer = 0;
    runCase = null;
    runIdx = 0;
    runParsed = [];
    runPaused = false;
    if (!silent) scheduleMatch(0);
  }

  let activeSet = 'layer';
  function activeGallery() { return activeSet === 'layer' ? LAYER_GALLERY : GALLERY; }
  const GAL_NOTE = {
    layer: '黄底白顶（白顶黄底同构）。X = 顺时针 90°，X\' = 逆时针，X2 = 180°。每格代号 u.1~u.9 / f.1~f.9 / r.1~r.9（左→右、上→下）。中心色记符号：<b>a</b>=顶心、<b>b</b>=前心、<b>c</b>=右心、<b>d</b>=左心、<b>e</b>=后心。卡片只比对有颜色的格子，<b>灰格跳过</b>；同时命中多条时，<b>比中格子多的优先</b>。卡片变绿＝现在就做这条。',
    pro: '黄底白顶。X = 顺时针 90°，X\' = 逆时针，X2 = 180°。每格有代号 U.1~U.9 / F.1~F.9 / R.1~R.9（左上→右下）。图例先给 U.5 / F.5 / R.5 三个中心格的色记 <b>a b c</b>，剩下的颜色按出现顺序记 <b>d e f</b>；当前魔方按同样规则赋值后逐格比对，<b>灰格跳过</b>。卡片变绿＝现在就该用这条。'
  };
  function renderGallery() {
    galBody.innerHTML = '';
    const listAll = activeGallery();
    const titles = activeSet === 'layer' ? LG_SEC_TITLE : SEC_TITLE;
    const notes = activeSet === 'layer' ? LG_SEC_NOTE : SEC_NOTE;
    const steps = activeSet === 'layer' ? [2, 3, 4, 5, 6, 7] : [1, 2, 3, 4, 5, 6, 7];
    const galNote = document.getElementById('galNote');
    if (galNote) galNote.innerHTML = GAL_NOTE[activeSet];
    for (const step of steps) {
      const list = listAll.filter(function (c) { return c.step === step; });
      if (!list.length && !notes[step]) continue;
      const sec = document.createElement('div');
      sec.className = 'gal-sec';
      const h = document.createElement('h3');
      h.innerHTML = titles[step] + '<s>' + (list.length ? list.length + ' 种形态' : '无公式') + '</s>';
      sec.appendChild(h);
      if (notes[step]) {
        const nt = document.createElement('div');
        nt.className = 'gal-note';
        nt.innerHTML = notes[step];
        sec.appendChild(nt);
        sec.querySelector('h3').style.marginBottom = '6px';
      }
      if (list.length) {
        const box = document.createElement('div');
        box.className = 'cases';
        box.style.marginTop = notes[step] ? '8px' : '0';
        for (const c of list) {
          if (!c.d) c.d = lgDiagram(c);
          else if (!c.cells) c.cells = lgFromDiagram(c.d);
          if (!c.d2 && LG_AFTER[c.step]) c.d2 = lgDiagramCells(LG_AFTER[c.step]);
          box.appendChild(buildCase(c));
        }
        sec.appendChild(box);
      }
      galBody.appendChild(sec);
    }
  }

  function setFormulaSet(name) {
    if (name === activeSet) return;
    stopRun(true);
    activeSet = name;
    document.getElementById('setLayer').classList.toggle('on', name === 'layer');
    document.getElementById('setPro').classList.toggle('on', name === 'pro');
    autoArmed = true;
    renderGallery();
    scheduleMatch(0);
  }
  document.getElementById('setLayer').addEventListener('click', function () { setFormulaSet('layer'); });
  document.getElementById('setPro').addEventListener('click', function () { setFormulaSet('pro'); });

  function openGallery() {
    exitSlow();
    renderGallery();
    galleryPanel.classList.add('show');
    learnBtn.classList.add('primary');
    scheduleMatch(0);
  }
  function closeGallery() {
    stopRun(true);
    galleryPanel.classList.remove('show');
    learnBtn.classList.remove('primary');
  }

  function setRunMode(mode) {
    runMode = mode;
    document.getElementById('modeManual').classList.toggle('on', mode === 'manual');
    document.getElementById('modeAuto').classList.toggle('on', mode === 'auto');
    if (runCase) {
      clearTimeout(runTimer);
      runPaused = false;
      renderRun();
      if (mode === 'auto') runTimer = setTimeout(stepRun, 900);
    }
  }
  document.getElementById('modeManual').addEventListener('click', function () { setRunMode('manual'); });
  document.getElementById('modeAuto').addEventListener('click', function () { setRunMode('auto'); });

  learnBtn.addEventListener('click', function () {
    if (galleryPanel.classList.contains('show')) closeGallery();
    else openGallery();
  });
  galClose.addEventListener('click', closeGallery);

  /* ================= 转动队列 ================= */
  let queue = [];
  let busy = false;
  let history = [];

  function enqueue(task) {
    queue.push(task);
    if (!busy) runQueue();
  }
  function runQueue() {
    if (!queue.length) { busy = false; refreshHud(); return; }
    busy = true;
    const t = queue.shift();
    t(runQueue);
  }
  function pushMove(name, opts) { const m = parseMove(name); pushTurn(m.axis, m.layer, m.angle, opts); }
  function pushTurn(axis, layer, angle, opts) {
    const o = opts || {};
    enqueue(function (next) {
      turnAnimated(axis, layer, angle, o.ms || 230, function () {
        if (o.undoStep) {
          opStack.pop();
          moves = Math.max(0, moves - 1);
        } else {
          if (!o.silent) moves++;
          if (!o.noHistory) history.push({ axis: axis, layer: layer, angle: angle });
          if (o.learnStep) opStack.pop();
          else opStack.push({ axis: axis, layer: layer, angle: angle });
          redoStack = [];
        }
        if (!o.runStep) {
          if (!runCase) autoArmed = true;      // 执行期间不复位，避免无限连环
          onUserMove({ axis: axis, layer: layer, angle: angle });
        }
        if (o.onApplied) o.onApplied();
        if (isSolvedNow()) opStack = [];
        refreshHud();
        next();
      });
    });
  }

  function turnSync(axis, layer, angle) {
    const M = rotMatrix(axis, angle);
    const i = AXIS_INDEX[axis];
    for (const c of cubies) {
      if (c.pos[i] !== layer) continue;
      c.pos = applyMatrix(M, c.pos);
      const next = {};
      for (const f of FACES) next[vecKey(applyMatrix(M, f.v))] = c.colors[f.key];
      c.colors = next;
      paint(c);
      c.body.style.transform = translateOf(c.pos);
    }
    refreshMirrors();
  }
  function turnAnimated(axis, layer, angle, ms, done) {
    const i = AXIS_INDEX[axis];
    const list = cubies.filter(c => c.pos[i] === layer);
    const n = [0, 0, 0]; n[i] = 1;
    const ax = n[0], ay = -n[1], az = n[2], ang = -angle;
    for (const c of list) {
      c.el.style.transition = 'transform ' + ms + 'ms cubic-bezier(.3,.05,.25,1)';
      c.el.style.transform = 'rotate3d(' + ax + ',' + ay + ',' + az + ',' + ang + 'deg)';
    }
    setTimeout(function () {
      turnSync(axis, layer, angle);
      for (const c of list) { c.el.style.transition = 'none'; c.el.style.transform = ''; }
      void cubeEl.offsetWidth;
      for (const c of list) c.el.style.transition = '';
      if (done) done();
    }, ms + 16);
  }

  function reset() {
    queue = []; busy = false; history = []; moves = 0; opStack = []; redoStack = [];
    stopRun(true);
    exitSlow();
    buildCube();
    refreshHud();
  }
  function undo() {
    if (busy || !history.length) return;
    const h = history.pop();
    redoStack.push({ axis: h.axis, layer: h.layer, angle: h.angle });
    enqueue(function (next) {
      turnAnimated(h.axis, h.layer, -h.angle, 200, function () {
        opStack.pop();
        moves = Math.max(0, moves - 1);
        refreshHud();
        next();
      });
    });
  }
  function redo() {
    if (busy || !redoStack.length) return;
    const h = redoStack.pop();
    enqueue(function (next) {
      turnAnimated(h.axis, h.layer, h.angle, 200, function () {
        moves++;
        history.push({ axis: h.axis, layer: h.layer, angle: h.angle });
        opStack.push({ axis: h.axis, layer: h.layer, angle: h.angle });
        refreshHud();
        next();
      });
    });
  }
  function scramble() {
    if (busy) return;
    stopRun(true);
    exitSlow();
    opStack = [];
    redoStack = [];
    const faces = ['U', 'D', 'L', 'R', 'F', 'B'];
    let prev = '';
    for (let i = 0; i < 22; i++) {
      let f;
      do { f = faces[Math.floor(Math.random() * 6)]; } while (f === prev);
      prev = f;
      const name = f + (Math.random() < 0.5 ? '' : "'");
      pushMove(name, { ms: 90, silent: true, noHistory: true });
    }
    moves = 0;
    history = [];
    refreshHud();
  }

  function refreshHud() {
    moveCountEl.textContent = moves;
    const data = cubies.map(c => ({ pos: c.pos, colors: c.colors }));
    const solved = !busy && isSolvedNow();
    stateTextEl.textContent = solved ? '已还原' : (busy ? '转动中' : '未还原');
    stateTextEl.className = solved ? 'ok' : '';
    if (undoBtnEl) undoBtnEl.disabled = !history.length;
    if (redoBtnEl) redoBtnEl.disabled = !redoStack.length;
    if (slowMode) refreshSlow();
    /* 执行公式 / 反做公式 / 按提示一步步走时，完全不匹配 */
    if (galleryPanel.classList.contains('show') && !runCase && !holdMatch) scheduleMatch();
  }

  /* ================= 视角 ================= */
  let dirRefreshTimer = 0;
  function applyView() {
    const t = 'scale(' + zoom + ') rotateX(' + viewX + 'deg) rotateY(' + viewY + 'deg)';
    cubeEl.style.transform = t;
    mirrorsEl.style.transform = t;
    refreshMirrors();
    /* 演示进行中：视角一变就重画右下角那张“转哪层”的缩略图 */
    if (runCase) {
      clearTimeout(dirRefreshTimer);
      dirRefreshTimer = setTimeout(function () {
        const holder = galHitEl && galHitEl.querySelector('.run-dir');
        if (!holder) return;
        const moves = runMoves();
        const mv = runParsed[runIdx] || parseMove(moves[runIdx]);
        if (mv) holder.innerHTML = dirCube(mv);
      }, 60);
    }
    /* 视角变了：如果图册开着、又不在执行/回退中，稍后重新匹配一次 */
    if (galleryPanel.classList.contains('show') && !runCase && !holdMatch) scheduleMatch(220);
  }

  let dragging = false, lastX = 0, lastY = 0, gesture = null;
  const FACE_CLASS_KEY = { front: 'pz', back: 'nz', right: 'px', left: 'nx', up: 'py', down: 'ny' };
  const AXIS_VEC = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };

  function cross3(a, b) { return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]; }
  function screenOf(v) { const s = viewOf(v); return [s[0], s[1]]; }
  function faceNormalOf(key) { for (const f of FACES) if (f.key === key) return f.v; return null; }
  const probeEl = document.getElementById('probe');
  function unitSize() {
    const w = probeEl ? probeEl.offsetWidth : 0;
    return w > 6 ? w : 38;
  }
  function pickTurn(g, dx, dy) {
    const n = faceNormalOf(g.faceKey);
    if (!n) return null;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) return null;
    let best = null;
    for (const name in AXIS_VEC) {
      const a = AXIS_VEC[name];
      if (Math.abs(a[0]*n[0] + a[1]*n[1] + a[2]*n[2]) > 0.5) continue;
      const ms = screenOf(cross3(a, n));
      const len = Math.hypot(ms[0], ms[1]);
      if (len < 0.2) continue;
      const dot = (dx*ms[0] + dy*ms[1]) / len;
      const score = Math.abs(dot) / dist;
      if (!best || score > best.score) best = { axis: name, len: len, score: score, proj: Math.abs(dot), sign: dot >= 0 ? 1 : -1 };
    }
    return best;
  }
  function fireSwipeTurn(g, t) {
    g.mode = 'done';
    pushTurn(t.axis, g.cubie.pos[AXIS_INDEX[t.axis]], t.sign * 90, { ms: 200 });
  }

  const SWIPE_RATIO = 0.8, SWIPE_MIN_PX = 13, VIEW_FALLBACK_PX = 26;

  stageEl.addEventListener('pointerdown', e => {
    lastX = e.clientX; lastY = e.clientY;
    dragging = true;
    stageEl.classList.add('dragging');
    if (stageEl.setPointerCapture) stageEl.setPointerCapture(e.pointerId);
    let cubie = null, faceKey = null;
    const t = e.target;
    if (t && t.classList && t.classList.contains('face')) {
      const holder = t.closest ? t.closest('.cubie') : null;
      if (holder && holder.__cubie) {
        for (const cls in FACE_CLASS_KEY) if (t.classList.contains(cls)) { faceKey = FACE_CLASS_KEY[cls]; break; }
        if (faceKey) cubie = holder.__cubie;
      }
    }
    gesture = { mode: (cubie && !busy && e.button !== 2) ? 'pending' : 'view', cubie: cubie, faceKey: faceKey, startX: e.clientX, startY: e.clientY };
  });
  stageEl.addEventListener('pointermove', e => {
    if (!dragging || !gesture) return;
    const g = gesture;
    if (g.mode === 'view') {
      viewY += (e.clientX - lastX) * 0.45;
      viewX -= (e.clientY - lastY) * 0.45;
      lastX = e.clientX; lastY = e.clientY;
      applyView();
      return;
    }
    if (g.mode !== 'pending') return;
    const dx = e.clientX - g.startX, dy = e.clientY - g.startY;
    const moved = Math.hypot(dx, dy);
    if (moved < 4) return;
    const t = pickTurn(g, dx, dy);
    if (!t || t.score < 0.45) {
      if (moved > VIEW_FALLBACK_PX) {
        g.mode = 'view';
        viewY += dx * 0.45; viewX -= dy * 0.45;
        lastX = e.clientX; lastY = e.clientY;
        applyView();
      }
      return;
    }
    const step = Math.max(SWIPE_MIN_PX, t.len * unitSize());
    if (t.proj < step * SWIPE_RATIO) return;
    fireSwipeTurn(g, t);
  });
  function endDrag() {
    const g = gesture;
    dragging = false;
    stageEl.classList.remove('dragging');
    gesture = null;
    if (g && g.mode === 'view') snapToAxis();
  }
  function cancelDrag() { dragging = false; stageEl.classList.remove('dragging'); gesture = null; }
  stageEl.addEventListener('pointerup', endDrag);
  stageEl.addEventListener('pointercancel', cancelDrag);
  stageEl.addEventListener('contextmenu', e => { if (gesture) e.preventDefault(); });

  function snapToAxis() {
    const nx = HOME_X + Math.round((viewX - HOME_X) / 90) * 90;
    const ny = HOME_Y + Math.round((viewY - HOME_Y) / 90) * 90;
    if (nx === viewX && ny === viewY) return;
    viewX = nx; viewY = ny;
    cubeEl.style.transition = 'transform 280ms cubic-bezier(.3,.05,.25,1)';
    mirrorsEl.style.transition = 'transform 280ms cubic-bezier(.3,.05,.25,1)';
    applyView();
    setTimeout(() => { cubeEl.style.transition = ''; mirrorsEl.style.transition = ''; }, 300);
  }
  stageEl.addEventListener('wheel', function (e) {
    if (e.ctrlKey) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.08 : 0.92;
    const nz = Math.min(2.4, Math.max(0.45, zoom * factor));
    if (nz === zoom) return;
    zoom = nz;
    applyView();
  }, { passive: false });
  stageEl.addEventListener('dblclick', () => {
    viewX = HOME_X; viewY = HOME_Y; zoom = 1;
    cubeEl.style.transition = 'transform .3s ease';
    mirrorsEl.style.transition = 'transform .3s ease';
    applyView();
    setTimeout(() => { cubeEl.style.transition = ''; mirrorsEl.style.transition = ''; }, 320);
  });

  /* ================= 镜面 ================= */
  const MIRROR_DOMS = {
    nx: document.getElementById('mirror-nx'), px: document.getElementById('mirror-px'),
    py: document.getElementById('mirror-py'), ny: document.getElementById('mirror-ny'),
    pz: document.getElementById('mirror-pz'), nz: document.getElementById('mirror-nz')
  };
  const MIRROR_CELLS = {};
  for (const k in MIRROR_DOMS) MIRROR_CELLS[k] = Array.from(MIRROR_DOMS[k].children);
  const FACE_CELL = {
    px: (r,c) => [1,1-r,c-1], nx: (r,c) => [-1,1-r,1-c],
    py: (r,c) => [c-1,1,1-r], ny: (r,c) => [c-1,-1,r-1],
    pz: (r,c) => [c-1,1-r,1], nz: (r,c) => [1-c,1-r,-1]
  };
  function findCubie(x, y, z) {
    for (const c of cubies) if (c.pos[0] === x && c.pos[1] === y && c.pos[2] === z) return c;
    return null;
  }
  function viewMatrix() {
    const ax = viewX * Math.PI / 180, ay = viewY * Math.PI / 180;
    const cx = Math.cos(ax), sx = Math.sin(ax), cy = Math.cos(ay), sy = Math.sin(ay);
    return [[cy,0,sy],[sx*sy,cx,-sx*cy],[-cx*sy,sx,cx*cy]];
  }
  function toView(M, d) {
    return [
      M[0][0]*d[0] + M[0][1]*d[1] + M[0][2]*d[2],
      M[1][0]*d[0] + M[1][1]*d[1] + M[1][2]*d[2],
      M[2][0]*d[0] + M[2][1]*d[1] + M[2][2]*d[2]
    ];
  }
  function viewOf(d) { return toView(viewMatrix(), [d[0], -d[1], d[2]]); }
  function refreshMirrors() {
    for (const f of FACES) {
      const dom = MIRROR_DOMS[f.key], cells = MIRROR_CELLS[f.key];
      const v = viewOf(f.v);
      if (v[2] < 0) {
        dom.classList.add('show');
        const get = FACE_CELL[f.key];
        for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
          const p = get(r, c);
          const cu = findCubie(p[0], p[1], p[2]);
          cells[r*3 + c].style.background = (cu && cu.colors[f.key]) || INNER;
        }
      } else dom.classList.remove('show');
    }
  }

  /* ================= 按钮与键盘 ================= */
  const MOVE_NAMES = ['U',"U'",'D',"D'",'L',"L'",'R',"R'",'F',"F'",'B',"B'"];
  const KEY_LABELS_2 = { U:'4',"U'":'6', D:'D',"D'":'A', L:'S',"L'":'W', R:'8',"R'":'2', F:'3',"F'":'1', B:'7',"B'":'9' };
  function keyLabel(name) {
    if (scheme === 1) return name.length > 1 ? '⇧' + name[0] : name;
    return KEY_LABELS_2[name];
  }
  function renderMoveButtons() {
    for (const b of moveRow.querySelectorAll('button.move')) b.remove();
    const frag = document.createDocumentFragment();
    MOVE_NAMES.forEach(name => {
      const alt = KEY_LABELS_2[name];
      /* 位置固定：先动作名、后键盘②键位。只切换「谁亮」 */
      const on = scheme === 1 ? ' on' : ' off';
      const off = scheme === 1 ? ' off' : ' on';
      const b = document.createElement('button');
      b.className = 'move';
      b.innerHTML = '<span class="k' + on + '">' + name + '</span>' +
                    '<span class="k' + off + '">' + alt + '</span>';
      b.title = name + ' · 键盘① ' + name + ' / 键盘② ' + alt;
      b.addEventListener('click', () => pushMove(name));
      frag.appendChild(b);
    });
    moveRow.insertBefore(frag, moveRow.firstChild);
  }

  document.getElementById('scrambleBtn').addEventListener('click', scramble);
  document.getElementById('undoBtn').addEventListener('click', undo);
  document.getElementById('redoBtn').addEventListener('click', redo);
  document.getElementById('viewBtn').addEventListener('click', () => {
    viewX = HOME_X; viewY = HOME_Y; zoom = 1;
    cubeEl.style.transition = 'transform .3s ease';
    mirrorsEl.style.transition = 'transform .3s ease';
    applyView();
    setTimeout(() => { cubeEl.style.transition = ''; mirrorsEl.style.transition = ''; }, 320);
  });

  const SCHEME_TIPS = {
    1: '方案① U D L R F B 转层 · 按住 Shift 反向 · 数字键 1-9 / Shift+A·D 转中层',
    2: '方案② W/S 左列上下 · A/D 底行左右 · 8/2 右列 · 4/6 顶行 · 1/3 前逆顺 · 7/9 后逆顺 · 5 切换中层 / Shift（或空格）+8·2·4·6 / A·D / 1·3 转中层 · 方向键换面'
  };
  const SCHEME_MARK = { 1: '①', 2: '②' };
  let scheme = 2;
  try {
    const saved = parseInt(localStorage.getItem('mofang.scheme.v3'), 10);
    if (saved === 1 || saved === 2) scheme = saved;
  } catch (err) {}
  function applyScheme() {
    schemeBtn.textContent = '键盘 ' + SCHEME_MARK[scheme];
    keyTip.textContent = SCHEME_TIPS[scheme];
    renderMoveButtons();
    try { localStorage.setItem('mofang.scheme.v3', String(scheme)); } catch (err) {}
  }

  function rotateView(dYaw, dPitch, animate) {
    viewY += dYaw; viewX += dPitch;
    if (animate) {
      cubeEl.style.transition = 'transform 220ms cubic-bezier(.3,.05,.25,1)';
      mirrorsEl.style.transition = 'transform 220ms cubic-bezier(.3,.05,.25,1)';
      applyView();
      setTimeout(() => { cubeEl.style.transition = ''; mirrorsEl.style.transition = ''; }, 240);
    } else applyView();
  }

  const FACE_VEC = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
  function frontFace() {
    let best = FACE_VEC[0], bestZ = -Infinity;
    for (const d of FACE_VEC) { const v = viewOf(d); if (v[2] > bestZ) { bestZ = v[2]; best = d; } }
    return best;
  }
  function sideFace(which) {
    const f = frontFace();
    const cand = FACE_VEC.filter(d => d[0]*f[0] + d[1]*f[1] + d[2]*f[2] === 0);
    let best = cand[0], bestVal = Infinity;
    for (const d of cand) {
      const v = viewOf(d);
      const val = which === 'left' ? v[0] : which === 'right' ? -v[0] : which === 'top' ? v[1] : -v[1];
      if (val < bestVal) { bestVal = val; best = d; }
    }
    return best;
  }
  const MOTION_DIR = { up: [0,-1,0], down: [0,1,0], left: [-1,0,0], right: [1,0,0] };
  function worldTurnFromCss(w) {
    const M = viewMatrix();
    const v = [
      M[0][0]*w[0] + M[1][0]*w[1] + M[2][0]*w[2],
      M[0][1]*w[0] + M[1][1]*w[1] + M[2][1]*w[2],
      M[0][2]*w[0] + M[1][2]*w[1] + M[2][2]*w[2]
    ];
    const n = [v[0], -v[1], v[2]];
    let idx = 0;
    for (let i = 1; i < 3; i++) if (Math.abs(n[i]) > Math.abs(n[idx])) idx = i;
    return { axis: ['x','y','z'][idx], angle: -90 * (n[idx] >= 0 ? 1 : -1) };
  }
  function turnFor(slab, dir) {
    const u = viewOf(slab), d = MOTION_DIR[dir];
    let s = Math.sign(u[1]*d[0] - u[0]*d[1]);
    if (!s) s = 1;
    const t = worldTurnFromCss([u[0]*s, u[1]*s, u[2]*s]);
    return { axis: t.axis, layer: slab[{x:0,y:1,z:2}[t.axis]], angle: t.angle };
  }
  function faceTurn(face, cw) {
    const u = viewOf(face), k = cw ? 1 : -1;
    const t = worldTurnFromCss([u[0]*k, u[1]*k, u[2]*k]);
    return { axis: t.axis, layer: face[{x:0,y:1,z:2}[t.axis]], angle: t.angle };
  }
  const ARROWS = { ArrowLeft:[-1,0], ArrowRight:[1,0], ArrowUp:[0,-1], ArrowDown:[0,1] };
  const MOTION = {
    w:{side:'left',dir:'up'}, s:{side:'left',dir:'down'},
    a:{side:'bottom',dir:'left'}, d:{side:'bottom',dir:'right'},
    ArrowLeft:{side:'top',dir:'left'}, ArrowRight:{side:'top',dir:'right'},
    ArrowUp:{side:'right',dir:'up'}, ArrowDown:{side:'right',dir:'down'}
  };
  function applyMotion(key, middle) {
    const m = MOTION[key]; if (!m) return;
    const t = turnFor(sideFace(m.side), m.dir);
    if (middle) t.layer = 0;
    pushTurn(t.axis, t.layer, t.angle);
  }
  function digitTurn(k, middle) {
    const side = { '8':['right','up'], '2':['right','down'], '4':['top','left'], '6':['top','right'] }[k];
    if (side) {
      const t = turnFor(sideFace(side[0]), side[1]);
      if (middle) t.layer = 0;
      pushTurn(t.axis, t.layer, t.angle);
      return true;
    }
    if (k === '1' || k === '3') {
      const t = faceTurn(frontFace(), k === '3');
      if (middle) t.layer = 0;
      pushTurn(t.axis, t.layer, t.angle);
      return true;
    }
    if (k === '7' || k === '9') {
      const f = frontFace();
      const t = faceTurn([-f[0],-f[1],-f[2]], k === '7');
      if (middle) t.layer = 0;
      pushTurn(t.axis, t.layer, t.angle);
      return true;
    }
    return false;
  }
  function switchFace(k) { rotateView(ARROWS[k][0]*90, ARROWS[k][1]*90, true); }

  let spaceDown = false, shiftDown = false, middleMode = false, midFlashTimer = 0;
  function setMiddleMode(on) {
    middleMode = on;
    layerModeEl.textContent = on ? '中层' : '外层';
    layerModeEl.classList.toggle('mid', on);
  }
  function flashMiddle() {
    layerModeEl.textContent = '中层';
    layerModeEl.classList.add('mid');
    clearTimeout(midFlashTimer);
    midFlashTimer = setTimeout(function () {
      layerModeEl.textContent = middleMode ? '中层' : '外层';
      layerModeEl.classList.toggle('mid', middleMode);
    }, 700);
  }

  document.addEventListener('keydown', e => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    const k = e.key;
    if (k === 'Shift') shiftDown = true;
    const dm = /^(?:Digit|Numpad)([1-9])$/.exec(e.code || '');
    const SHIFTED = { '*':'8','@':'2','$':'4','^':'6','(':'9','!':'1' };
    let digit = dm ? dm[1] : (k >= '1' && k <= '9' ? k : '');
    if (!digit && e.shiftKey && SHIFTED[k]) digit = SHIFTED[k];
    if (!digit && e.keyCode) {
      if (e.keyCode >= 49 && e.keyCode <= 57) digit = String(e.keyCode - 48);
      else if (e.keyCode >= 97 && e.keyCode <= 105) digit = String(e.keyCode - 96);
    }
    if (e.code === 'Space' || k === ' ') { e.preventDefault(); spaceDown = true; return; }
    if (digit === '5') { e.preventDefault(); if (!e.repeat) setMiddleMode(!middleMode); return; }
    const shiftState = e.shiftKey || shiftDown || (typeof e.getModifierState === 'function' && e.getModifierState('Shift'));
    if (spaceDown && ARROWS[k]) {
      e.preventDefault();
      const step = shiftState ? 7 : 90;
      rotateView(ARROWS[k][0]*step, ARROWS[k][1]*step, !shiftState);
      return;
    }
    const wantMiddle = middleMode || shiftState || spaceDown;
    if (digit && digitTurn(digit, wantMiddle)) {
      e.preventDefault();
      if (wantMiddle && !middleMode) flashMiddle();
      return;
    }
    if (ARROWS[k]) { e.preventDefault(); switchFace(k); return; }
    const scheme1Letter = scheme === 1 && 'udlrfb'.includes(k.toLowerCase()) && k.length === 1;
    if (!scheme1Letter && k.length === 1 && 'wsad'.includes(k.toLowerCase())) {
      e.preventDefault();
      applyMotion(k.toLowerCase(), wantMiddle);
      if (wantMiddle && !middleMode) flashMiddle();
      return;
    }
    if (scheme === 1) {
      const upper = k.toUpperCase();
      if (!'UDLRFB'.includes(upper) || upper.length !== 1) return;
      e.preventDefault();
      pushMove(shiftState ? upper + "'" : upper);
      return;
    }
  });
  document.addEventListener('keyup', e => {
    if (e.code === 'Space' || e.key === ' ') spaceDown = false;
    if (e.key === 'Shift') shiftDown = false;
  });
  window.addEventListener('blur', () => { spaceDown = false; shiftDown = false; });
  schemeBtn.addEventListener('click', () => { scheme = scheme === 1 ? 2 : 1; applyScheme(); });

  /* ================= 启动 ================= */
  buildCube();
  refreshHud();
  applyScheme();
})();

