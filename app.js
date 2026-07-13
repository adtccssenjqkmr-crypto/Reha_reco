/**
 * app.js
 * アプリケーションのステート管理、画面遷移、患者CRUD、動的フォーム生成、およびイベント制御
 */

// アプリケーションステート
let state = {
  patients: [],
  customEvaluations: [],
  currentPatientIndex: -1,
  currentRecordIndex: -1,
  editingRecordIndex: -1, // -1: 新規評価モード, >=0: 過去レコード編集モード
  currentView: "view-patients",
  historyStack: [], // シンプルなビュー遷移履歴
  currentDomain: "neuron",
  evalSets: [],
  currentEvalSetId: ""
};

// タイマーの状態管理
let timerInterval = null;
let timerStart = 0;
let timerElapsed = 0;

// アプリ初期化時の処理
document.addEventListener("DOMContentLoaded", () => {
  loadData();
  setupEventListeners();
  renderPatientsList();
  renderCustomEvaluationsList();
  
  // デフォルトビューを設定
  
  switchView("view-patients");
});

// ローカルストレージからデータをロード
function loadData() {
  try {
    state.customEvaluations = JSON.parse(localStorage.getItem("rehareco_custom_evaluations") || "[]");
    loadEvalSets(); // 評価セットロード
    
    const storedPatients = localStorage.getItem("rehareco_patients");
    if (storedPatients) {
      state.patients = JSON.parse(storedPatients);
    } else {
      // デモデータの自動生成
      state.patients = getDemoData();
      savePatients();
    }
  } catch (e) {
    console.error("データの読み込みに失敗しました:", e);
    state.patients = [];
    state.customEvaluations = [];
    state.evalSets = [];
  }
}

// ローカルストレージにデータを保存
function savePatients() {
  localStorage.setItem("rehareco_patients", JSON.stringify(state.patients));
}

function saveCustomEvaluations() {
  localStorage.setItem("rehareco_custom_evaluations", JSON.stringify(state.customEvaluations));
}

function loadEvalSets() {
  try {
    const stored = localStorage.getItem("rehareco_eval_sets");
    if (stored) {
      state.evalSets = JSON.parse(stored);
    } else {
      // 初期デフォルト評価セット
      state.evalSets = [
        { id: "set_acute", name: "脳卒中・急性期基本セット", domain: "neuron", evaluations: ["nihss", "brs", "sias"] },
        { id: "set_convalescent", name: "脳卒中・回復期総合セット", domain: "neuron", evaluations: ["bbs", "walk_10m", "tug", "fim", "rom"] },
        { id: "set_pusher", name: "プッシャー症候群評価セット", domain: "neuron", evaluations: ["scp", "bls"] }
      ];
      saveEvalSets();
    }
  } catch (e) {
    console.error("評価セットの読み込みに失敗しました:", e);
    state.evalSets = [];
  }
}

function saveEvalSets() {
  localStorage.setItem("rehareco_eval_sets", JSON.stringify(state.evalSets));
}





// ローカルストレージにデータを保存
function savePatients() {
  localStorage.setItem("rehareco_patients", JSON.stringify(state.patients));
}

function saveCustomEvaluations() {
  localStorage.setItem("rehareco_custom_evaluations", JSON.stringify(state.customEvaluations));
}

// 画面切り替えルーター
function switchView(viewId, pushToStack = true) {
  const views = document.querySelectorAll(".app-view");
  views.forEach(v => v.classList.remove("active"));
  
  const targetView = document.getElementById(viewId);
  if (targetView) {
    targetView.classList.add("active");
    targetView.classList.add("slide-in");
  }
  
  // ナビゲーションアクティブ状態の変更
  const navItems = document.querySelectorAll(".nav-item");
  navItems.forEach(item => {
    if (item.getAttribute("data-view") === viewId) {
      item.classList.add("active");
    } else {
      item.classList.remove("active");
    }
  });

  // 対象者追加ボタン（FAB）の表示制御：一覧画面でのみ表示する
  const addPatientBtn = document.getElementById("btn-add-patient-fab");
  if (addPatientBtn) {
    if (viewId === "view-patients") {
      addPatientBtn.style.display = "flex";
    } else {
      addPatientBtn.style.display = "none";
    }
  }

  if (pushToStack && state.currentView !== viewId) {
    state.historyStack.push(state.currentView);
  }
  state.currentView = viewId;

  // ヘッダーアクション（戻るボタンなど）の制御
  renderHeaderAction();
}

// 前の画面に戻る
function goBack() {
  if (state.historyStack.length > 0) {
    const prevView = state.historyStack.pop();
    switchView(prevView, false);
  } else {
    switchView("view-patients", false);
  }
}

// ヘッダーの状況に応じたボタン制御
function renderHeaderAction() {
  const container = document.getElementById("header-action");
  container.innerHTML = "";

  if (state.currentView !== "view-patients") {
    const backBtn = document.createElement("button");
    backBtn.className = "btn btn-secondary";
    backBtn.style.padding = "6px 12px";
    backBtn.style.fontSize = "13px";
    backBtn.style.width = "auto";
    backBtn.textContent = "戻る";
    backBtn.addEventListener("click", goBack);
    container.appendChild(backBtn);
  }
}

// イベントリスナーのセットアップ
function setupEventListeners() {
  // ボトムナビゲーション
  document.querySelectorAll(".bottom-nav .nav-item").forEach(button => {
    button.addEventListener("click", (e) => {
      const viewId = button.getAttribute("data-view");
      if (viewId) {
        // 設定画面か患者一覧に切り替える
        switchView(viewId);
      }
    });
  });

  // 検索機能
  const searchInput = document.getElementById("patient-search");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      renderPatientsList(e.target.value);
    });
  }

  // 患者追加 FAB
  const addFab = document.getElementById("btn-add-patient-fab");
  if (addFab) {
    addFab.addEventListener("click", () => showPatientModal());
  }

  // 患者登録フォーム送信
  const patientForm = document.getElementById("patient-form");
  if (patientForm) {
    patientForm.addEventListener("submit", handlePatientSubmit);
  }

  // 患者編集ボタン
  const editPatientBtn = document.getElementById("btn-edit-patient");
  if (editPatientBtn) {
    editPatientBtn.addEventListener("click", () => {
      if (state.currentPatientIndex >= 0) {
        showPatientModal(state.currentPatientIndex);
      }
    });
  }

  // 患者モーダルの閉じるボタン類
  document.getElementById("btn-close-patient-modal").addEventListener("click", hidePatientModal);
  document.getElementById("btn-cancel-patient").addEventListener("click", hidePatientModal);

  // 履歴詳細モーダルの閉じるボタン類
  document.getElementById("btn-close-history-modal").addEventListener("click", () => hideModal("history-detail-modal"));
  document.getElementById("btn-close-history-modal-ok").addEventListener("click", () => hideModal("history-detail-modal"));
  
  // 新規評価作成へ進むボタン
  document.getElementById("btn-new-assessment").addEventListener("click", () => {
    if (state.currentPatientIndex >= 0) {
      showAssessmentSetup(state.currentPatientIndex);
    }
  });

  // 評価開始ボタン (チェックリストから採点フォームへ)
  document.getElementById("btn-start-scoring").addEventListener("click", startScoring);

  // フォームからチェックリストに戻るボタン
  document.getElementById("btn-back-to-select").addEventListener("click", () => {
    document.getElementById("assessment-step-form").style.display = "none";
    document.getElementById("assessment-step-select").style.display = "block";
  });

  // 評価記録保存
  const assessmentForm = document.getElementById("active-assessment-form");
  if (assessmentForm) {
    assessmentForm.addEventListener("submit", handleAssessmentSubmit);
  }

  // カスタム評価項目追加フォーム
  const customEvalForm = document.getElementById("custom-eval-form");
  if (customEvalForm) {
    customEvalForm.addEventListener("submit", handleCustomEvalSubmit);
  }

  // グラフフィルター変更時の描画更新
  const chartEvalSelect = document.getElementById("chart-eval-select");
  const chartSubitemSelect = document.getElementById("chart-subitem-select");

  if (chartEvalSelect) {
    chartEvalSelect.addEventListener("change", (e) => {
      updateChartSubitemDropdown(e.target.value);
      triggerChartUpdate();
    });
  }

  if (chartSubitemSelect) {
    chartSubitemSelect.addEventListener("change", triggerChartUpdate);
  }

  // 領域タブ切り替え
  document.querySelectorAll(".domain-tab").forEach(tab => {
    tab.addEventListener("click", (e) => {
      document.querySelectorAll(".domain-tab").forEach(t => {
        t.classList.remove("active");
        t.style.borderBottomColor = "transparent";
      });
      tab.classList.add("active");
      tab.style.borderBottomColor = "var(--accent-blue)";
      
      const domain = tab.getAttribute("data-domain");
      state.currentDomain = domain;
      renderAssessmentAccordion(domain);
    });
  });

  // 評価セット選択
  const evalSetSelect = document.getElementById("eval-set-select");
  if (evalSetSelect) {
    evalSetSelect.addEventListener("change", (e) => {
      applyEvalSet(e.target.value);
    });
  }

  // 評価セット保存
  const saveEvalSetBtn = document.getElementById("btn-save-eval-set");
  if (saveEvalSetBtn) {
    saveEvalSetBtn.addEventListener("click", () => {
      saveCurrentAsEvalSet();
    });
  }

  // 評価セット削除
  const deleteEvalSetBtn = document.getElementById("btn-delete-eval-set");
  if (deleteEvalSetBtn) {
    deleteEvalSetBtn.addEventListener("click", () => {
      deleteCurrentEvalSet();
    });
  }

  // データ管理関連
  document.getElementById("btn-export").addEventListener("click", exportData);
  const exportCsvBtn = document.getElementById("btn-export-csv");
  if (exportCsvBtn) {
    exportCsvBtn.addEventListener("click", exportDataCSV);
  }
  
  const importTrigger = document.getElementById("btn-import-trigger");
  const fileImport = document.getElementById("file-import");
  
  if (importTrigger && fileImport) {
    importTrigger.addEventListener("click", () => fileImport.click());
    fileImport.addEventListener("change", importData);
  }

  document.getElementById("btn-clear-all").addEventListener("click", clearAllData);
  
  // 記録削除ボタン
  document.getElementById("btn-delete-record").addEventListener("click", deleteCurrentRecord);

  // 記録編集・修正ボタン
  const editRecordBtn = document.getElementById("btn-edit-record");
  if (editRecordBtn) {
    editRecordBtn.addEventListener("click", editCurrentRecord);
  }
}

// -------------------------------------------------------------
// 患者管理 (CRUD) ロジック
// -------------------------------------------------------------

function renderPatientsList(query = "") {
  const container = document.getElementById("patients-container");
  if (!container) return;
  container.innerHTML = "";

  const q = query.toLowerCase().trim();
  const filtered = state.patients.filter(p => {
    return p.id.toLowerCase().includes(q) || 
           (p.diagnosis && p.diagnosis.toLowerCase().includes(q)) ||
           (p.memo && p.memo.toLowerCase().includes(q));
  });

  if (filtered.length === 0) {
    container.innerHTML = `<div class="no-data">${query ? '検索結果が見つかりません。' : '対象者が登録されていません。右下の「＋」ボタンから追加してください。'}</div>`;
    return;
  }

  filtered.forEach((patient, idx) => {
    // 元の配列のインデックスを特定
    const originalIndex = state.patients.indexOf(patient);
    
    // 直近の記録日
    let lastDate = "記録なし";
    let scoreSummary = "";
    if (patient.records && patient.records.length > 0) {
      // 日付順にソートして最新のものを取得
      const sorted = [...patient.records].sort((a, b) => new Date(b.date) - new Date(a.date));
      lastDate = sorted[0].date;
      
      // 主要なスコアがあればサマリー表示
      const evals = sorted[0].evaluations;
      const keys = Object.keys(evals);
      if (keys.length > 0) {
        scoreSummary = keys.slice(0, 2).map(k => {
          const meta = PRESET_EVALUATIONS[k] || state.customEvaluations.find(c => c.id === k);
          const name = meta ? meta.name.split("（")[0].split("(")[0] : k;
          const val = evals[k].total !== undefined ? `${evals[k].total}点` : 
                      evals[k].score !== undefined ? `${evals[k].score}` : 
                      evals[k].time !== undefined ? `${evals[k].time}秒` : "記録あり";
          return `${name}: ${val}`;
        }).join(" / ");
      }
    }

    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="card-title">
        <span>${escapeHtml(patient.id)}</span>
        <span class="card-badge">${escapeHtml(patient.diagnosis || "疾患名未登録")}</span>
      </div>
      <div class="card-meta">性別: ${escapeHtml(patient.gender || "未設定")} | 年齢: ${patient.age ? patient.age + '歳' : '未設定'}</div>
      <div class="card-meta">最終測定日: ${lastDate}</div>
      ${scoreSummary ? `<div class="card-meta" style="font-weight: 500; color: var(--accent-blue);">${scoreSummary}</div>` : ""}
    `;
    card.addEventListener("click", () => showPatientDetail(originalIndex));
    container.appendChild(card);
  });
}

function showPatientModal(index = -1) {
  const modal = document.getElementById("patient-modal");
  const form = document.getElementById("patient-form");
  const title = document.getElementById("patient-modal-title");
  
  form.reset();
  document.getElementById("patient-index").value = index;

  if (index >= 0) {
    title.textContent = "対象者情報の編集";
    const p = state.patients[index];
    document.getElementById("patient-id").value = p.id;
    document.getElementById("patient-id").disabled = true; // IDは一意とするため編集不可に
    document.getElementById("patient-age").value = p.age || "";
    document.getElementById("patient-gender").value = p.gender || "";
    document.getElementById("patient-diagnosis").value = p.diagnosis || "";
    document.getElementById("patient-memo").value = p.memo || "";
  } else {
    title.textContent = "新規対象者登録";
    document.getElementById("patient-id").disabled = false;
  }

  modal.classList.add("active");
}

function hidePatientModal() {
  document.getElementById("patient-modal").classList.remove("active");
}

function handlePatientSubmit(e) {
  e.preventDefault();
  const index = parseInt(document.getElementById("patient-index").value);
  const id = document.getElementById("patient-id").value.trim();
  const age = document.getElementById("patient-age").value ? parseInt(document.getElementById("patient-age").value) : null;
  const gender = document.getElementById("patient-gender").value;
  const diagnosis = document.getElementById("patient-diagnosis").value.trim();
  const memo = document.getElementById("patient-memo").value.trim();

  if (!id) return;

  if (index >= 0) {
    // 既存編集
    state.patients[index].age = age;
    state.patients[index].gender = gender;
    state.patients[index].diagnosis = diagnosis;
    state.patients[index].memo = memo;
  } else {
    // 新規登録。ID重複チェック
    if (state.patients.some(p => p.id === id)) {
      alert("すでに同じIDで登録されています。別の識別子を使用してください。");
      return;
    }
    state.patients.push({
      id, age, gender, diagnosis, memo, records: []
    });
  }

  savePatients();
  hidePatientModal();
  renderPatientsList();
  
  if (index >= 0) {
    showPatientDetail(index); // 編集した場合は詳細に戻る
  }
}

// -------------------------------------------------------------
// 患者詳細 ＆ グラフ表示
// -------------------------------------------------------------

function showPatientDetail(index) {
  state.currentPatientIndex = index;
  const p = state.patients[index];
  
  document.getElementById("detail-patient-id").textContent = p.id;
  document.getElementById("detail-patient-meta").textContent = 
    `性別: ${p.gender || "未登録"} | 年齢: ${p.age ? p.age + '歳' : '未登録'} | 疾患: ${p.diagnosis || "未登録"}\nメモ: ${p.memo || "なし"}`;

  // グラフフィルター（評価項目）のドロップダウン初期化
  initChartFilterDropdowns(p);
  
  // 履歴リストの描画
  renderHistoryList(p);

  switchView("view-patient-detail");
}

function initChartFilterDropdowns(patient) {
  const select = document.getElementById("chart-eval-select");
  if (!select) return;
  select.innerHTML = "";

  // 患者が過去に測定したことのある評価項目IDの一覧を収集
  const measuredEvalIds = new Set();
  patient.records.forEach(r => {
    if (r.evaluations) {
      Object.keys(r.evaluations).forEach(id => measuredEvalIds.add(id));
    }
  });

  const listItems = measuredEvalIds.size > 0 ? Array.from(measuredEvalIds) : Object.keys(PRESET_EVALUATIONS);

  // ドメイン大分類 (general, neuron, ortho, custom) ごとにグループを初期化
  const grouped = {
    general: [],
    neuron: [],
    ortho: [],
    custom: []
  };

  listItems.forEach(id => {
    const meta = PRESET_EVALUATIONS[id];
    if (meta) {
      const dId = meta.domain || "neuron";
      const cId = meta.category || "neurology";
      
      let catName = "";
      if (REHAB_DOMAINS[dId] && REHAB_DOMAINS[dId].categories && REHAB_DOMAINS[dId].categories[cId]) {
        catName = REHAB_DOMAINS[dId].categories[cId];
      }
      
      const displayName = catName ? `【${catName}】 ${meta.name}` : meta.name;
      grouped[dId].push({ id, name: displayName });
    } else {
      const custom = state.customEvaluations.find(c => c.id === id);
      if (custom) {
        grouped.custom.push({ id, name: `【カスタム】 ${custom.name}` });
      }
    }
  });

  // ドメイン大分類順に optgroup を追加
  const domainOrder = ["general", "neuron", "ortho"];
  domainOrder.forEach(dId => {
    const dMeta = REHAB_DOMAINS[dId];
    if (dMeta && grouped[dId] && grouped[dId].length > 0) {
      const group = document.createElement("optgroup");
      group.label = dMeta.name;
      
      // 名前順ソート
      grouped[dId].sort((a, b) => a.name.localeCompare(b.name));
      
      grouped[dId].forEach(item => {
        const opt = document.createElement("option");
        opt.value = item.id;
        opt.textContent = item.name;
        group.appendChild(opt);
      });
      select.appendChild(group);
    }
  });

  // カスタム項目
  if (grouped.custom.length > 0) {
    const group = document.createElement("optgroup");
    group.label = "カスタム追加項目";
    grouped.custom.forEach(item => {
      const opt = document.createElement("option");
      opt.value = item.id;
      opt.textContent = item.name;
      group.appendChild(opt);
    });
    select.appendChild(group);
  }

  // 初期値のロード
  if (select.options.length > 0) {
    select.selectedIndex = 0;
    updateChartSubitemDropdown(select.value);
    triggerChartUpdate();
  } else {
    showNoChartDataMessage("progressionChart");
  }
}

function updateChartSubitemDropdown(evalId) {
  const subSelect = document.getElementById("chart-subitem-select");
  if (!subSelect) return;
  subSelect.innerHTML = "";

  const meta = PRESET_EVALUATIONS[evalId] || state.customEvaluations.find(c => c.id === evalId);
  if (!meta) return;

  // デフォルト項目「代表値 / 合計」を追加
  const optTotal = document.createElement("option");
  optTotal.value = "total";
  
  if (meta.inputType === "timer_numeric") {
    optTotal.textContent = "測定時間 (秒)";
  } else if (meta.inputType === "single_select") {
    optTotal.textContent = "総合スコア";
  } else if (meta.inputType === "rom") {
    // ROMは合計点がないので、サブ項目を羅列する
    optTotal.style.display = "none"; 
  } else {
    optTotal.textContent = "合計点 / 総合値";
  }
  subSelect.appendChild(optTotal);

  // 下位項目の羅列
  if (meta.subItems) {
    Object.keys(meta.subItems).forEach(key => {
      // 10m歩行で計算済みのものなど、すべてを可視化可能にする
      const subItem = meta.subItems[key];
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = subItem.name;
      subSelect.appendChild(opt);
    });
  }

  // MAL用個別動作の羅列
  if (meta.actions && meta.inputType === "mal_custom") {
    meta.actions.forEach(act => {
      const opt = document.createElement("option");
      opt.value = act.id;
      opt.textContent = act.name;
      subSelect.appendChild(opt);
    });
  }

  // ROMの場合は、最初の関節部位をデフォルトにする
  if (meta.inputType === "rom") {
    subSelect.value = Object.keys(meta.subItems)[0];
  } else {
    subSelect.value = "total";
  }
}

function triggerChartUpdate() {
  resetChartView("progressionChart");
  const pIndex = state.currentPatientIndex;
  if (pIndex < 0) return;
  
  const evalId = document.getElementById("chart-eval-select").value;
  const subItemId = document.getElementById("chart-subitem-select").value;
  
  if (!evalId) {
    showNoChartDataMessage("progressionChart");
    return;
  }

  const patient = state.patients[pIndex];
  updateChart("progressionChart", patient.records, evalId, subItemId);
  
  // 評価詳細および評価日選択チップスの描画
  renderChartEvalDetail(patient, evalId);
}

function renderChartEvalDetail(patient, evalId, selectedDate = null) {
  const container = document.getElementById("chart-eval-detail-container");
  if (!container) return;
  container.innerHTML = "";
  container.style.display = "none";

  // この項目が測定されている全レコードを抽出 (古い順から新しい順、時系列順)
  const targetRecords = patient.records
    .filter(r => r.evaluations && r.evaluations[evalId] !== undefined)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  if (targetRecords.length === 0) {
    return; // 測定記録がなければ表示しない
  }

  container.style.display = "block";

  // デフォルトの選択日を設定 (指定がなければ最も新しい測定日)
  if (!selectedDate) {
    selectedDate = targetRecords[targetRecords.length - 1].date;
  }

  // 選択されたレコードを特定
  const activeRecord = targetRecords.find(r => r.date === selectedDate);
  if (!activeRecord) return;

  const evalData = activeRecord.evaluations[evalId];
  const meta = PRESET_EVALUATIONS[evalId] || state.customEvaluations.find(c => c.id === evalId);
  if (!meta) return;

  // 1. パネル全体コンテナの作成
  const panel = document.createElement("div");
  panel.className = "eval-detail-panel";

  // 2. ヘッダー部の作成
  const header = document.createElement("div");
  header.className = "eval-detail-header";

  const titleRow = document.createElement("div");
  titleRow.className = "eval-detail-title-row";

  const title = document.createElement("span");
  title.className = "eval-detail-title";
  title.textContent = `${meta.name} 内訳詳細`;

  const totalBadge = document.createElement("span");
  totalBadge.className = "eval-detail-total-badge";
  
  let totalScore = "";
  if (typeof evalData === "object" && evalData.total !== undefined) {
    totalScore = `${evalData.total} 点`;
  } else if (typeof evalData === "number") {
    totalScore = `${evalData} ${meta.unit || "点"}`;
  } else {
    totalScore = `${evalData} ${meta.unit || ""}`;
  }
  totalBadge.textContent = totalScore;

  titleRow.appendChild(title);
  titleRow.appendChild(totalBadge);
  header.appendChild(titleRow);

  // 3. 日付選択チップス (Date Chips) の追加
  const chipsLabel = document.createElement("div");
  chipsLabel.className = "eval-date-chips-label";
  chipsLabel.textContent = "評価日の切り替え";
  header.appendChild(chipsLabel);

  const chipsContainer = document.createElement("div");
  chipsContainer.className = "eval-date-chips";

  targetRecords.forEach(r => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = `eval-date-chip ${r.date === selectedDate ? "active" : ""}`;
    chip.textContent = r.date;
    chip.addEventListener("click", () => {
      renderChartEvalDetail(patient, evalId, r.date);
    });
    chipsContainer.appendChild(chip);
  });
  header.appendChild(chipsContainer);
  panel.appendChild(header);

  // 4. 得点内訳リスト (Grid) の追加
  const grid = document.createElement("div");
  grid.className = "eval-detail-grid";

  // 数値のみ、またはカスタム項目の場合
  if (typeof evalData !== "object") {
    const item = document.createElement("div");
    item.className = "eval-detail-item";
    
    const itemHeader = document.createElement("div");
    itemHeader.className = "eval-detail-item-header";
    
    const nameSpan = document.createElement("span");
    nameSpan.className = "eval-detail-item-name";
    nameSpan.textContent = meta.name;
    
    const valSpan = document.createElement("span");
    valSpan.className = "eval-detail-item-val";
    valSpan.textContent = `${evalData} ${meta.unit || ""}`;
    
    itemHeader.appendChild(nameSpan);
    itemHeader.appendChild(valSpan);
    item.appendChild(itemHeader);

    if (meta.description) {
      const descDiv = document.createElement("div");
      descDiv.className = "eval-detail-item-desc";
      descDiv.textContent = meta.description;
      item.appendChild(descDiv);
    }
    grid.appendChild(item);
  } else {
    // 複数スケール (multi_scale) または ROM の場合
    const subItemKeys = Object.keys(meta.subItems || {}).filter(k => k !== "total");
    
    if (meta.inputType === "rom") {
      subItemKeys.forEach(k => {
        const sideVal = evalData[k];
        const item = document.createElement("div");
        item.className = "eval-detail-item";

        const itemHeader = document.createElement("div");
        itemHeader.className = "eval-detail-item-header";

        const nameSpan = document.createElement("span");
        nameSpan.className = "eval-detail-item-name";
        nameSpan.textContent = meta.subItems[k].name;

        const valSpan = document.createElement("span");
        valSpan.className = "eval-detail-item-val";
        
        let leftText = sideVal && sideVal.left !== undefined ? `左: ${sideVal.left}°` : "左: --";
        let rightText = sideVal && sideVal.right !== undefined ? `右: ${sideVal.right}°` : "右: --";
        valSpan.textContent = `${leftText} / ${rightText}`;

        itemHeader.appendChild(nameSpan);
        itemHeader.appendChild(valSpan);
        item.appendChild(itemHeader);
        grid.appendChild(item);
      });
    } else {
      const itemsConfig = meta.items || [];
      
      subItemKeys.forEach(k => {
        const val = evalData[k];
        const itemConfig = itemsConfig.find(x => x.id === k);
        const subItemConfig = meta.subItems[k];

        const item = document.createElement("div");
        item.className = "eval-detail-item";

        const itemHeader = document.createElement("div");
        itemHeader.className = "eval-detail-item-header";

        const nameSpan = document.createElement("span");
        nameSpan.className = "eval-detail-item-name";
        nameSpan.textContent = subItemConfig ? subItemConfig.name : k;

        const valSpan = document.createElement("span");
        valSpan.className = "eval-detail-item-val";
        valSpan.textContent = val !== undefined ? `${val} 点` : "--";

        itemHeader.appendChild(nameSpan);
        itemHeader.appendChild(valSpan);
        item.appendChild(itemHeader);

        let descText = "";
        if (itemConfig && itemConfig.criteria && val !== undefined) {
          descText = itemConfig.criteria[val] || "";
        }

        if (descText) {
          const descDiv = document.createElement("div");
          descDiv.className = "eval-detail-item-desc";
          descDiv.textContent = descText;
          item.appendChild(descDiv);
        }

        grid.appendChild(item);
      });
    }
  }

  panel.appendChild(grid);
  container.appendChild(panel);
}


function renderHistoryList(patient) {
  const container = document.getElementById("history-container");
  if (!container) return;
  container.innerHTML = "";

  if (!patient.records || patient.records.length === 0) {
    container.innerHTML = '<div class="no-data">測定履歴がありません。「＋ 新規評価」から記録を開始してください。</div>';
    return;
  }

  const sortedRecords = [...patient.records].sort((a, b) => new Date(b.date) - new Date(a.date));

  sortedRecords.forEach(record => {
    const evalNames = Object.keys(record.evaluations).map(id => {
      const meta = PRESET_EVALUATIONS[id] || state.customEvaluations.find(c => c.id === id);
      return meta ? meta.name.split("（")[0].split("(")[0] : id;
    }).join(", ");

    const origRecordIndex = patient.records.indexOf(record);

    const item = document.createElement("div");
    item.className = "history-item";
    item.innerHTML = `
      <div>
        <div class="history-date">${record.date}</div>
        <div class="history-scales">${escapeHtml(evalNames)}</div>
      </div>
      <div>
        <span class="card-badge" style="background: rgba(16, 185, 129, 0.08); color: var(--accent-green);">詳細 ＞</span>
      </div>
    `;
    item.addEventListener("click", () => showHistoryDetail(origRecordIndex));
    container.appendChild(item);
  });
}

function showHistoryDetail(recordIndex) {
  state.currentRecordIndex = recordIndex;
  const patient = state.patients[state.currentPatientIndex];
  const record = patient.records[recordIndex];

  const metaContainer = document.getElementById("history-detail-meta");
  metaContainer.innerHTML = `
    <div><strong>評価日:</strong> ${record.date}</div>
    <div><strong>評価者:</strong> ${escapeHtml(record.evaluator || "未登録")}</div>
  `;

  const contentContainer = document.getElementById("history-detail-content");
  contentContainer.innerHTML = "";

  Object.keys(record.evaluations).forEach(evalId => {
    const evalData = record.evaluations[evalId];
    const meta = PRESET_EVALUATIONS[evalId] || state.customEvaluations.find(c => c.id === evalId);
    const evalName = meta ? meta.name : evalId;

    const section = document.createElement("div");
    section.style.marginBottom = "16px";
    section.style.paddingBottom = "12px";
    section.style.borderBottom = "1px solid var(--border-color)";

    let scoreHTML = "";
    
    if (meta && meta.inputType === "multi_scale") {
      scoreHTML = `<div style="font-weight: 700; color: var(--accent-blue); margin-bottom: 6px;">${evalName}: ${evalData.total}点</div>`;
      const excludeKeys = [
        "total", "arm_total", "leg_total", "motor_total", "sensory_total", "static_bal", "dynamic_bal", "coordination",
        "motor_sub", "cognitive_sub", "self_care", "respiration_sphincter", "mobility", "uems", "lems",
        "pain", "rom", "walking", "adl", "pain_walking", "stairs", "rom_limitation", "swelling",
        "symptoms", "findings", "adl_back",
        "chase_left", "chase_right", "nose_left", "nose_right", "rotation_left", "rotation_right", "shin_left", "shin_right",
        "pain", "function", "support", "xray", "rolling_both",
        "eye", "verbal", "motor", "weight_loss", "muscle_weakness", "fatigue", "slowness", "low_activity", "balance", "gait", "chair_stand",
        "mobility", "feeding", "incontinence", "eye_movement", "comprehension", "cognition", "speech", "auditory", "visual", "oromotor", "arousal"];
      const itemsListHTML = Object.keys(evalData)
        .filter(k => !excludeKeys.includes(k))
        .map(k => {
          const itemMeta = meta.subItems[k] ? meta.subItems[k].name : k;
          return `<div style="font-size: 13px; color: var(--text-secondary); margin-left: 12px; margin-bottom: 2px;">・${itemMeta}: ${evalData[k]}点</div>`;
        }).join("");
      
      let subTotalsHTML = "";
      if (evalData.arm_total !== undefined) subTotalsHTML += `<div style="font-size:12px; color: var(--text-muted); margin-left: 12px;">(上肢: ${evalData.arm_total}点 / 下肢: ${evalData.leg_total}点)</div>`;
      if (evalId === "sias" && evalData.motor_total !== undefined) subTotalsHTML += `<div style="font-size:12px; color: var(--text-muted); margin-left: 12px;">(運動: ${evalData.motor_total}点 / 感覚: ${evalData.sensory_total}点)</div>`;
      if (evalData.static_bal !== undefined) subTotalsHTML += `<div style="font-size:12px; color: var(--text-muted); margin-left: 12px;">(静的: ${evalData.static_bal}点 / 動的: ${evalData.dynamic_bal}点 / 協調性: ${evalData.coordination}点)</div>`;
      if (evalData.motor_sub !== undefined) subTotalsHTML += `<div style="font-size:12px; color: var(--text-muted); margin-left: 12px;">(運動ADL: ${evalData.motor_sub}点 / 認知ADL: ${evalData.cognitive_sub}点)</div>`;
      if (evalId === "scim") {
        subTotalsHTML += `<div style="font-size:12px; color: var(--text-muted); margin-left: 12px;">(セルフケア: ${evalData.self_care}点 / 呼吸・排泄: ${evalData.respiration_sphincter}点 / 移動: ${evalData.mobility}点)</div>`;
      }
      if (evalId === "ais") {
        subTotalsHTML += `<div style="font-size:12px; color: var(--text-muted); margin-left: 12px;">(UEMS: ${evalData.uems}点 / LEMS: ${evalData.lems}点)</div>`;
      }
      if (evalId === "joa_hip") {
        subTotalsHTML += `<div style="font-size:12px; color: var(--text-muted); margin-left: 12px;">(疼痛: ${evalData.pain}点 / 可動域: ${evalData.rom}点 / 歩行: ${evalData.walking}点 / ADL: ${evalData.adl}点)</div>`;
      }
      if (evalId === "joa_knee") {
        subTotalsHTML += `<div style="font-size:12px; color: var(--text-muted); margin-left: 12px;">(痛み・歩行: ${evalData.pain_walking}点 / 階段: ${evalData.stairs}点 / 可動域制限: ${evalData.rom_limitation}点 / 腫脹: ${evalData.swelling}点)</div>`;
      }
      if (evalId === "joa_back") {
        subTotalsHTML += `<div style="font-size:12px; color: var(--text-muted); margin-left: 12px;">(自覚症状: ${evalData.symptoms}点 / 客観的所見: ${evalData.findings}点 / ADL: ${evalData.adl_back}点)</div>`;
      }
                        if (evalId === "nasva") {
        subTotalsHTML += `<div style="font-size:12px; color: var(--text-muted); margin-left: 12px; line-height:1.4;">
          運動: ${evalData.mobility}点 / 摂食: ${evalData.feeding}点 / 排泄: ${evalData.incontinence}点 / 認知: ${evalData.cognition}点 / 発声発語: ${evalData.speech}点 / 口頭理解: ${evalData.comprehension}点
        </div>`;
      }
      if (evalId === "crs_r") {
        subTotalsHTML += `<div style="font-size:12px; color: var(--text-muted); margin-left: 12px; line-height:1.4;">
          聴覚: ${evalData.auditory}点 / 視覚: ${evalData.visual}点 / 運動: ${evalData.motor}点 / 口運動: ${evalData.oromotor}点 / コミュ: ${evalData.communication}点 / 覚醒: ${evalData.arousal}点
        </div>`;
      }
      if (evalId === "gcs") {
        subTotalsHTML += `<div style="font-size:12px; color: var(--text-muted); margin-left: 12px;">(開眼: E${evalData.eye} / 言語: V${evalData.verbal} / 運動: M${evalData.motor})</div>`;
      }
      if (evalId === "j_chs") {
        let status = "ロバスト (健康)";
        if (evalData.total >= 3) status = "フレイル (要対策)";
        else if (evalData.total >= 1) status = "プレフレイル (前段階)";
        subTotalsHTML += `<div style="font-size:12px; color: var(--text-muted); margin-left: 12px; margin-top:2px;">
          <strong>フレイル診断: ${status}</strong><br>
          ・体重減少: ${evalData.weight_loss ? "該当" : "非該当"}<br>
          ・筋力低下: ${evalData.muscle_weakness ? "該当" : "非該当"}<br>
          ・疲労感: ${evalData.fatigue ? "該当" : "非該当"}<br>
          ・歩行速度低下: ${evalData.slowness ? "該当" : "非該当"}<br>
          ・身体活動低下: ${evalData.low_activity ? "該当" : "非該当"}
        </div>`;
      }
      if (evalId === "sppb") {
        subTotalsHTML += `<div style="font-size:12px; color: var(--text-muted); margin-left: 12px; line-height: 1.4;">
          バランス試験: ${evalData.balance}点 / 歩行速度(4m): ${evalData.gait}点 / 立ち上がり試験: ${evalData.chair_stand}点
        </div>`;
      }
      if (evalId === "joa_shoulder") {
        subTotalsHTML += `<div style="font-size:12px; color: var(--text-muted); margin-left: 12px;">(疼痛: ${evalData.pain}点 / 可動域: ${evalData.rom}点 / 機能: ${evalData.function}点 / 支持性: ${evalData.support}点 / X線: ${evalData.xray}点)</div>`;
      }
      if (evalId === "bls") {
        subTotalsHTML += `<div style="font-size:12px; color: var(--text-muted); margin-left: 12px;">(仰臥位: ${evalData.rolling + evalData.rolling_both}点 / 座位: ${evalData.sitting}点 / 立位: ${evalData.standing}点 / 移乗: ${evalData.transfers}点 / 歩行: ${evalData.walking}点)</div>`;
      }
      if (evalId === "sara") {
        const c_mean = ((evalData.chase_left || 0) + (evalData.chase_right || 0)) / 2;
        const n_mean = ((evalData.nose_left || 0) + (evalData.nose_right || 0)) / 2;
        const r_mean = ((evalData.rotation_left || 0) + (evalData.rotation_right || 0)) / 2;
        const s_mean = ((evalData.shin_left || 0) + (evalData.shin_right || 0)) / 2;
        subTotalsHTML += `<div style="font-size:12px; color: var(--text-muted); margin-left: 12px; margin-top: 4px; line-height: 1.5;">
          <strong>協調運動評価 (左右平均):</strong><br>
          ・指追跡平均: ${c_mean}点 (左: ${evalData.chase_left || 0} / 右: ${evalData.chase_right || 0})<br>
          ・指鼻平均: ${n_mean}点 (左: ${evalData.nose_left || 0} / 右: ${evalData.nose_right || 0})<br>
          ・交互回内回外平均: ${r_mean}点 (左: ${evalData.rotation_left || 0} / 右: ${evalData.rotation_right || 0})<br>
          ・踵脛平均: ${s_mean}点 (左: ${evalData.shin_left || 0} / 右: ${evalData.shin_right || 0})
        </div>`;
      }
 
      scoreHTML += itemsListHTML + subTotalsHTML;

    } else if (meta && meta.inputType === "rom") {
      scoreHTML = `<div style="font-weight: 700; color: var(--accent-purple); margin-bottom: 6px;">${evalName}</div>`;
      const romLines = Object.keys(evalData).map(k => {
        const itemMeta = meta.subItems[k] ? meta.subItems[k].name : k;
        const leftVal = evalData[k].left !== undefined ? `${evalData[k].left}°` : "--";
        const rightVal = evalData[k].right !== undefined ? `${evalData[k].right}°` : "--";
        return `<div style="font-size: 13px; color: var(--text-secondary); margin-left: 12px; display: flex; justify-content: space-between; max-width: 320px;">
          <span>・${itemMeta}</span>
          <span style="font-family: var(--font-title);">左: <span style="color:var(--accent-blue);">${leftVal}</span> / 右: <span style="color:var(--accent-purple);">${rightVal}</span></span>
        </div>`;
      }).join("");
      scoreHTML += romLines;

    } else if (meta && meta.inputType === "bilateral_numeric") {
      const leftVal = evalData.left !== undefined ? `${evalData.left} ${meta.unit || ''}` : "--";
      const rightVal = evalData.right !== undefined ? `${evalData.right} ${meta.unit || ''}` : "--";
      scoreHTML = `<div style="font-weight: 700; color: var(--text-primary);">${evalName}: 
        <span style="font-family: var(--font-title); font-size:14px; margin-left: 12px;">左: <span style="color:var(--accent-blue);">${leftVal}</span> / 右: <span style="color:var(--accent-purple);">${rightVal}</span></span>
      </div>`;

    } else if (evalId === "walk_10m") {
      scoreHTML = `
        <div style="font-weight: 700; color: var(--text-primary); margin-bottom: 4px;">${evalName}</div>
        <div style="font-size: 13px; color: var(--text-secondary); margin-left: 12px;">・時間: ${evalData.time} 秒</div>
        <div style="font-size: 13px; color: var(--text-secondary); margin-left: 12px;">・歩数: ${evalData.steps} 歩</div>
        <div style="font-size: 13px; color: var(--accent-green); font-weight: 600; margin-left: 12px; margin-top: 4px;">計算結果: 歩行速度 ${evalData.speed} m/min | 歩幅 ${evalData.stride} cm</div>
      `;
    } else if (evalId === "brs") {
      scoreHTML = `
        <div style="font-weight: 700; color: var(--accent-purple); margin-bottom: 4px;">${evalName}</div>
        <div style="font-size: 13px; color: var(--text-secondary); margin-left: 12px;">・上肢: Stage ${evalData.arm}</div>
        <div style="font-size: 13px; color: var(--text-secondary); margin-left: 12px;">・手指: Stage ${evalData.hand}</div>
        <div style="font-size: 13px; color: var(--text-secondary); margin-left: 12px;">・下肢: Stage ${evalData.leg}</div>
      `;
    } else if (evalId === "mas") {
      scoreHTML = `
        <div style="font-weight: 700; color: var(--accent-danger); margin-bottom: 4px;">${evalName}</div>
        <div style="font-size: 13px; color: var(--text-secondary); margin-left: 12px;">・対象筋: ${escapeHtml(evalData.target_muscle)}</div>
        <div style="font-size: 13px; color: var(--text-secondary); margin-left: 12px;">・スコア: MAS ${evalData.score}</div>
      `;
    } else if (evalId === "walk_6min") {
      scoreHTML = `
        <div style="font-weight: 700; color: var(--text-primary); margin-bottom: 4px;">${evalName}</div>
        <div style="font-size: 13px; color: var(--text-secondary); margin-left: 12px;">・歩行距離: ${evalData.distance} m</div>
        <div style="font-size: 13px; color: var(--text-secondary); margin-left: 12px;">・Borg主観的運動強度: ${evalData.borg_before || '--'} (前) → ${evalData.borg_after || '--'} (後)</div>
      `;
    } else {
      const val = evalData.score !== undefined ? evalData.score : (evalData.time || "");
      const unit = meta ? meta.unit || "" : "";
      scoreHTML = `<div style="font-weight: 700;">${evalName}: <span style="color: var(--accent-blue);">${val} ${unit}</span></div>`;
      if (evalData.memo) {
        scoreHTML += `<div style="font-size: 12px; color: var(--text-muted); margin-left: 12px; margin-top: 2px;">メモ: ${escapeHtml(evalData.memo)}</div>`;
      }
    }

    section.innerHTML = scoreHTML;
    contentContainer.appendChild(section);
  });

  showModal("history-detail-modal");
}

function deleteCurrentRecord() {
  if (state.currentPatientIndex < 0 || state.currentRecordIndex < 0) return;
  
  if (confirm("この日の評価記録をすべて完全に削除してもよろしいですか？")) {
    const patient = state.patients[state.currentPatientIndex];
    patient.records.splice(state.currentRecordIndex, 1);
    
    savePatients();
    hideModal("history-detail-modal");
    
    // 詳細ビューのリフレッシュ
    showPatientDetail(state.currentPatientIndex);
  }
}

// 過去レコードの編集・修正モードの起動
function editCurrentRecord() {
  const pIndex = state.currentPatientIndex;
  const rIndex = state.currentRecordIndex;
  if (pIndex < 0 || rIndex < 0) return;

  hideModal("history-detail-modal");
  
  const p = state.patients[pIndex];
  const record = p.records[rIndex];
  
  // 編集モードをセット
  state.editingRecordIndex = rIndex;
  
  // 評価画面の表示
  switchView("view-assessment");
  document.getElementById("assessment-patient-name").textContent = `ID: ${p.id}`;
  document.getElementById("assessment-step-select").style.display = "block";
  document.getElementById("assessment-step-form").style.display = "none";
  
  // 過去の日付と評価者を設定
  document.getElementById("assessment-date").value = record.date;
  document.getElementById("assessment-evaluator").value = record.evaluator || "";
  
  // 過去の評価項目を取得
  const checkedIds = Object.keys(record.evaluations);
  state.selectedEvaluations = [...checkedIds];
  
  // ドメインの特定
  let defaultDomain = "neuron";
  if (checkedIds.length > 0) {
    const firstId = checkedIds[0];
    const meta = PRESET_EVALUATIONS[firstId] || state.customEvaluations.find(c => c.id === firstId);
    if (meta && meta.domain) {
      defaultDomain = meta.domain;
    }
  }
  
  state.currentDomain = defaultDomain;
  state.currentEvalSetId = "";
  
  // タブの初期化
  document.querySelectorAll(".domain-tab").forEach(tab => {
    if (tab.getAttribute("data-domain") === defaultDomain) {
      tab.classList.add("active");
      tab.style.borderBottomColor = "var(--accent-blue)";
    } else {
      tab.classList.remove("active");
      tab.style.borderBottomColor = "transparent";
    }
  });
  
  updateEvalSetDropdown();
  
  // アコーディオンの描画とチェック状態の復元
  renderAssessmentAccordion(defaultDomain);
  
  // 直接「採点を開始する」画面に遷移
  startScoring();
  
  // 値の復元
  restoreFormData(record.evaluations);
}

// 過去評価データのフォーム自動セット（編集時）
function restoreFormData(evalsData) {
  Object.keys(evalsData).forEach(evalId => {
    const data = evalsData[evalId];
    const meta = PRESET_EVALUATIONS[evalId] || state.customEvaluations.find(c => c.id === evalId);
    if (!meta) return;

    if (meta.inputType === "multi_scale" || meta.inputType === "single_select") {
      const itemsList = meta.items || [];
      if (meta.inputType === "single_select") {
        const itemVal = data.score !== undefined ? data.score : data;
        const section = document.querySelector(`.assessment-section[data-eval-id="${evalId}"]`);
        if (section) {
          const input = section.querySelector(`input[name="${evalId}_score"]`);
          if (input) input.value = itemVal;
          const choices = section.querySelectorAll(".score-choice");
          choices.forEach(ch => {
            const numEl = ch.querySelector(".score-num");
            if (numEl && numEl.textContent.trim() === String(itemVal)) {
              ch.classList.add("selected");
            }
          });
        }
      } else {
        itemsList.forEach(item => {
          const itemVal = data[item.id];
          if (itemVal === undefined || itemVal === null) return;
          const section = document.querySelector(`.assessment-section[data-eval-id="${evalId}"]`);
          if (section) {
            const input = section.querySelector(`input[name="${evalId}_${item.id}"]`);
            if (input) input.value = itemVal;
            const scaleItemEl = section.querySelector(`.scale-item[data-item-id="${item.id}"]`);
            if (scaleItemEl) {
              const choices = scaleItemEl.querySelectorAll(".score-choice");
              choices.forEach(ch => {
                const numEl = ch.querySelector(".score-num");
                if (numEl && numEl.textContent.trim() === String(itemVal)) {
                  ch.classList.add("selected");
                }
              });
            }
          }
        });
        recalculateMultiScaleTotal(evalId, meta);
      }
    }
    else if (meta.inputType === "rom") {
      Object.keys(meta.subItems).forEach(key => {
        const val = data[key];
        if (val) {
          const lInput = document.querySelector(`input[name="${evalId}_${key}_left"]`);
          const rInput = document.querySelector(`input[name="${evalId}_${key}_right"]`);
          if (lInput && val.left !== null) lInput.value = val.left;
          if (rInput && val.right !== null) rInput.value = val.right;
        }
      });
    }
    else if (meta.inputType === "bilateral_numeric") {
      const lInput = document.querySelector(`input[name="${evalId}_left"]`);
      const rInput = document.querySelector(`input[name="${evalId}_right"]`);
      if (lInput && data.left !== null) lInput.value = data.left;
      if (rInput && data.right !== null) rInput.value = data.right;
    }
    else if (meta.inputType === "walk_10m_calc") {
      const timeInput = document.getElementById(`${evalId}_time`);
      const stepsInput = document.getElementById(`${evalId}_steps`);
      if (timeInput && data.time !== null) timeInput.value = data.time;
      if (stepsInput && data.steps !== null) stepsInput.value = data.steps;
      
      const speedSpan = document.getElementById(`${evalId}_speed_computed`);
      const strideSpan = document.getElementById(`${evalId}_stride_computed`);
      if (speedSpan && data.speed) speedSpan.textContent = data.speed;
      if (strideSpan && data.stride) strideSpan.textContent = data.stride;
    }
    else if (meta.inputType === "timer_numeric") {
      const timeInput = document.getElementById(`${evalId}_time`);
      if (timeInput && data.time !== null) timeInput.value = data.time;
    }
    else if (meta.inputType === "walk_6min_custom") {
      const distInput = document.querySelector(`input[name="${evalId}_distance"]`);
      const beforeSelect = document.querySelector(`select[name="${evalId}_borg_before"]`);
      const afterSelect = document.querySelector(`select[name="${evalId}_borg_after"]`);
      if (distInput && data.distance !== null) distInput.value = data.distance;
      if (beforeSelect && data.borg_before !== null) beforeSelect.value = data.borg_before;
      if (afterSelect && data.borg_after !== null) afterSelect.value = data.borg_after;
    }
    else if (meta.inputType === "brs_custom") {
      const armSelect = document.querySelector(`select[name="${evalId}_arm"]`);
      const handSelect = document.querySelector(`select[name="${evalId}_hand"]`);
      const legSelect = document.querySelector(`select[name="${evalId}_leg"]`);
      if (armSelect && data.arm) armSelect.value = data.arm;
      if (handSelect && data.hand) handSelect.value = data.hand;
      if (legSelect && data.leg) legSelect.value = data.leg;
    }
    else if (meta.inputType === "mas_custom") {
      const muscleInput = document.querySelector(`input[name="${evalId}_target_muscle"]`);
      const scoreSelect = document.querySelector(`select[name="${evalId}_score"]`);
      if (muscleInput && data.target_muscle) muscleInput.value = data.target_muscle;
      if (scoreSelect && data.score) scoreSelect.value = data.score;
    }
    else if (meta.inputType === "stef_custom") {
      meta.items.forEach(item => {
        const itemVal = data[item.id];
        if (itemVal) {
          const tL = document.querySelector(`input[name="${evalId}_${item.id}_time_left"]`);
          const sL = document.querySelector(`select[name="${evalId}_${item.id}_score_left"]`);
          const tR = document.querySelector(`input[name="${evalId}_${item.id}_time_right"]`);
          const sR = document.querySelector(`select[name="${evalId}_${item.id}_score_right"]`);
          
          if (tL && itemVal.time_left !== null) tL.value = itemVal.time_left;
          if (sL && itemVal.score_left !== null) sL.value = itemVal.score_left;
          if (tR && itemVal.time_right !== null) tR.value = itemVal.time_right;
          if (sR && itemVal.score_right !== null) sR.value = itemVal.score_right;
        }
      });
      const lTotal = document.getElementById(`${evalId}_left_total_computed`);
      const rTotal = document.getElementById(`${evalId}_right_total_computed`);
      if (lTotal && data.left_total !== null) lTotal.textContent = data.left_total;
      if (rTotal && data.right_total !== null) rTotal.textContent = data.right_total;
    }
    else if (meta.inputType === "mal_custom") {
      meta.actions.forEach(act => {
        const actVal = data[act.id];
        if (actVal) {
          const aouSelect = document.querySelector(`select[name="${evalId}_${act.id}_aou"]`);
          const qomSelect = document.querySelector(`select[name="${evalId}_${act.id}_qom"]`);
          if (aouSelect && actVal.aou !== null) aouSelect.value = actVal.aou;
          if (qomSelect && actVal.qom !== null) qomSelect.value = actVal.qom;
        }
      });
      const aouMean = document.getElementById(`${evalId}_aou_mean_computed`);
      const qomMean = document.getElementById(`${evalId}_qom_mean_computed`);
      if (aouMean && data.aou_mean !== null) aouMean.textContent = data.aou_mean;
      if (qomMean && data.qom_mean !== null) qomMean.textContent = data.qom_mean;
    }
    else {
      const scoreInput = document.querySelector(`input[name="${evalId}_score"]`);
      const memoInput = document.querySelector(`input[name="${evalId}_memo"]`);
      if (scoreInput && data.score !== null) scoreInput.value = data.score;
      if (memoInput && data.memo) memoInput.value = data.memo;
    }
  });
}

// -------------------------------------------------------------
// 新規評価入力フォームの生成・処理
// -------------------------------------------------------------

function showAssessmentSetup(patientIndex) {
  switchView("view-assessment");
  const p = state.patients[patientIndex];
  
  document.getElementById("assessment-patient-name").textContent = `ID: ${p.id}`;
  document.getElementById("assessment-step-select").style.display = "block";
  document.getElementById("assessment-step-form").style.display = "none";
  
  // 領域デフォルト
  state.currentPatientIndex = patientIndex;
  state.editingRecordIndex = -1;
  state.selectedEvaluations = [];
  state.currentDomain = "general";
  state.currentEvalSetId = "";
  
  // タブの状態初期化
  document.querySelectorAll(".domain-tab").forEach(tab => {
    if (tab.getAttribute("data-domain") === "general") {
      tab.classList.add("active");
      tab.style.borderBottomColor = "var(--accent-blue)";
    } else {
      tab.classList.remove("active");
      tab.style.borderBottomColor = "transparent";
    }
  });

  // 評価セットプルダウンの初期化
  updateEvalSetDropdown();

  // アコーディオンリストの描画
  renderAssessmentAccordion("general");
}

function renderAssessmentAccordion(domain) {
  const container = document.getElementById("assessment-accordion-list");
  if (!container) return;
  container.innerHTML = "";

  if (domain === "custom") {
    const accordionItem = document.createElement("div");
    accordionItem.className = "accordion-item active"; // 最初から開く
    
    const header = document.createElement("div");
    header.className = "accordion-header";
    header.innerHTML = `
      <span class="accordion-title">カスタム登録項目</span>
      <div class="accordion-info-group">
        <span class="accordion-badge" id="badge-custom">0 / ${state.customEvaluations.length}</span>
      </div>
    `;
    
    const content = document.createElement("div");
    content.className = "accordion-content";
    content.style.maxHeight = "500px";
    
    const inner = document.createElement("div");
    inner.className = "accordion-content-inner";
    inner.style.display = "flex";
    inner.style.flexDirection = "column";
    inner.style.gap = "8px";
    
    state.customEvaluations.forEach(custom => {
      createChecklistItem(inner, custom.id, custom.name, "custom", "custom");
    });
    
    if (state.customEvaluations.length === 0) {
      inner.innerHTML = '<div style="color:var(--text-muted); font-size:12px; text-align:center; padding: 10px;">登録されたカスタム項目はありません。「設定」から追加できます。</div>';
    }
    
    content.appendChild(inner);
    accordionItem.appendChild(header);
    accordionItem.appendChild(content);
    container.appendChild(accordionItem);
    updateAccordionBadge("custom");
    return;
  }

  // プリセット領域 (neuron または ortho)
  const domainMeta = REHAB_DOMAINS[domain];
  if (!domainMeta) return;

  Object.keys(domainMeta.categories).forEach(catId => {
    const catName = domainMeta.categories[catId];
    
    // このカテゴリーに属する評価項目をフィルタリング
    const evals = Object.keys(PRESET_EVALUATIONS)
      .map(k => PRESET_EVALUATIONS[k])
      .filter(item => item && item.domain === domain && item.category === catId);
      
    if (evals.length === 0 && domain === "ortho") {
      const accordionItem = document.createElement("div");
      accordionItem.className = "accordion-item";
      
      const header = document.createElement("div");
      header.className = "accordion-header";
      header.innerHTML = `
        <span class="accordion-title">${catName}</span>
        <div class="accordion-info-group">
          <span class="accordion-badge">準備中</span>
          <span class="accordion-arrow">▼</span>
        </div>
      `;
      
      const content = document.createElement("div");
      content.className = "accordion-content";
      const inner = document.createElement("div");
      inner.className = "accordion-content-inner";
      inner.innerHTML = `<div style="color:var(--text-muted); font-size:12px; text-align:center; padding: 12px;">※整形外科疾患用の項目（例: VAS, JOAスコア等）は次期フェーズで追加予定です。</div>`;
      
      content.appendChild(inner);
      accordionItem.appendChild(header);
      accordionItem.appendChild(content);
      container.appendChild(accordionItem);
      
      header.addEventListener("click", () => {
        const isActive = accordionItem.classList.contains("active");
        if (isActive) {
          accordionItem.classList.remove("active");
        } else {
          accordionItem.classList.add("active");
        }
      });
      return;
    }

    const accordionItem = document.createElement("div");
    accordionItem.className = "accordion-item";
    
    const header = document.createElement("div");
    header.className = "accordion-header";
    header.innerHTML = `
      <span class="accordion-title">${catName}</span>
      <div class="accordion-info-group">
        <span class="accordion-badge" id="badge-${catId}">0 / ${evals.length}</span>
        <span class="accordion-arrow">▼</span>
      </div>
    `;
    
    const content = document.createElement("div");
    content.className = "accordion-content";
    const inner = document.createElement("div");
    inner.className = "accordion-content-inner";
    inner.style.display = "flex";
    inner.style.flexDirection = "column";
    inner.style.gap = "8px";
    
    evals.forEach(ev => {
      createChecklistItem(inner, ev.id, ev.name, domain, catId);
    });
    
    content.appendChild(inner);
    accordionItem.appendChild(header);
    accordionItem.appendChild(content);
    container.appendChild(accordionItem);
    
    header.addEventListener("click", () => {
      const isActive = accordionItem.classList.contains("active");
      if (isActive) {
        accordionItem.classList.remove("active");
      } else {
        accordionItem.classList.add("active");
      }
    });

    updateAccordionBadge(catId);
  });

  // 浮遊ボタンに隠れないための十分なスペーサーを追加
  const spacer = document.createElement("div");
  spacer.className = "accordion-spacer";
  spacer.style.height = "160px";
  container.appendChild(spacer);

}

function createChecklistItem(container, id, name, domain, category) {
  const item = document.createElement("label");
  item.className = "checklist-item";
  
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.value = id;
  checkbox.setAttribute("data-domain", domain);
  checkbox.setAttribute("data-category", category);
  
  // すでに選択されている（編集時、またはセット選択されている）かの確認
  let shouldCheck = false;
  if (state.selectedEvaluations && state.selectedEvaluations.includes(id)) {
    shouldCheck = true;
  } else if (state.currentEvalSetId) {
    const activeSet = state.evalSets.find(s => s.id === state.currentEvalSetId);
    if (activeSet && activeSet.evaluations.includes(id)) {
      shouldCheck = true;
      // ステート側にも追加
      if (!state.selectedEvaluations.includes(id)) {
        state.selectedEvaluations.push(id);
      }
    }
  }
  
  if (shouldCheck) {
    checkbox.checked = true;
    item.classList.add("checked");
  }

  checkbox.addEventListener("change", () => {
    if (checkbox.checked) {
      item.classList.add("checked");
      if (!state.selectedEvaluations.includes(id)) {
        state.selectedEvaluations.push(id);
      }
    } else {
      item.classList.remove("checked");
      state.selectedEvaluations = state.selectedEvaluations.filter(x => x !== id);
    }
    updateAccordionBadge(category);
  });

  item.appendChild(checkbox);
  
  const labelText = document.createElement("span");
  labelText.textContent = name;
  item.appendChild(labelText);

  container.appendChild(item);
}

function updateAccordionBadge(category) {
  const badge = document.getElementById(`badge-${category}`);
  if (!badge) return;

  const total = document.querySelectorAll(`input[type="checkbox"][data-category="${category}"]`).length;
  const checked = document.querySelectorAll(`input[type="checkbox"][data-category="${category}"]:checked`).length;

  badge.textContent = `${checked} / ${total}`;
  if (checked > 0) {
    badge.classList.add("checked-active");
  } else {
    badge.classList.remove("checked-active");
  }
}

function updateEvalSetDropdown() {
  const select = document.getElementById("eval-set-select");
  const deleteBtn = document.getElementById("btn-delete-eval-set");
  if (!select) return;

  select.innerHTML = '<option value="">-- セットを選択しない --</option>';

  state.evalSets.forEach(set => {
    const opt = document.createElement("option");
    opt.value = set.id;
    opt.textContent = set.name;
    select.appendChild(opt);
  });

  if (state.currentEvalSetId) {
    select.value = state.currentEvalSetId;
    const isDefault = ["set_acute", "set_convalescent", "set_pusher"].includes(state.currentEvalSetId);
    if (deleteBtn) deleteBtn.style.display = isDefault ? "none" : "block";
  } else {
    select.value = "";
    if (deleteBtn) deleteBtn.style.display = "none";
  }
}

function applyEvalSet(setId) {
  state.currentEvalSetId = setId;
  updateEvalSetDropdown();

  if (!setId) {
    document.querySelectorAll("#assessment-accordion-list input[type='checkbox']").forEach(cb => {
      cb.checked = false;
      cb.parentElement.classList.remove("checked");
    });
  } else {
    const set = state.evalSets.find(s => s.id === setId);
    if (set) {
      document.querySelectorAll("#assessment-accordion-list input[type='checkbox']").forEach(cb => {
        cb.checked = false;
        cb.parentElement.classList.remove("checked");
      });
      
      set.evaluations.forEach(evalId => {
        const cb = document.querySelector(`#assessment-accordion-list input[type='checkbox'][value='${evalId}']`);
        if (cb) {
          cb.checked = true;
          cb.parentElement.classList.add("checked");
        }
      });
    }
  }

  const categories = ["custom"];
  Object.keys(REHAB_DOMAINS).forEach(dId => {
    Object.keys(REHAB_DOMAINS[dId].categories).forEach(cId => {
      categories.push(cId);
    });
  });
  categories.forEach(cat => updateAccordionBadge(cat));
}

function saveCurrentAsEvalSet() {
  // state.selectedEvaluations を用いることで、非アクティブなアコーディオンや他タブのチェック状態も完全に網羅
  if (!state.selectedEvaluations || state.selectedEvaluations.length === 0) {
    alert("セットとして保存するには、評価項目を少なくとも1つ選択してください。");
    return;
  }

  const name = prompt("作成する評価項目のセット名を入力してください：\n(例：〇〇病院標準セット、腰痛評価セット など)");
  if (!name || !name.trim()) return;

  const newId = "set_" + Date.now();
  const selectedList = [...state.selectedEvaluations];

  const newSet = {
    id: newId,
    name: name.trim(),
    domain: state.currentDomain,
    evaluations: selectedList
  };

  state.evalSets.push(newSet);
  saveEvalSets();
  state.currentEvalSetId = newId;
  updateEvalSetDropdown();
  alert(`評価セット「${name}」を登録しました。`);
}

function deleteCurrentEvalSet() {
  if (!state.currentEvalSetId) return;
  
  const isDefault = ["set_acute", "set_convalescent", "set_pusher"].includes(state.currentEvalSetId);
  if (isDefault) {
    alert("デフォルトの評価セットは削除できません。");
    return;
  }

  const setIndex = state.evalSets.findIndex(s => s.id === state.currentEvalSetId);
  if (setIndex >= 0) {
    const setName = state.evalSets[setIndex].name;
    if (confirm(`本当に評価セット「${setName}」を削除しますか？`)) {
      state.evalSets.splice(setIndex, 1);
      saveEvalSets();
      state.currentEvalSetId = "";
      updateEvalSetDropdown();
      applyEvalSet("");
    }
  }
}

function startScoring() {
  const checkedBoxes = document.querySelectorAll("#assessment-accordion-list input[type='checkbox']:checked");
  if (checkedBoxes.length === 0) {
    alert("評価項目を少なくとも1つ選択してください。");
    return;
  }

  // フォーム日付のデフォルトを今日にする
  const dateInput = document.getElementById("assessment-date");
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  dateInput.value = `${yyyy}-${mm}-${dd}`;

  // フォーム生成
  const formContainer = document.getElementById("dynamic-assessment-inputs");
  formContainer.innerHTML = "";

  checkedBoxes.forEach(box => {
    const evalId = box.value;
    const meta = PRESET_EVALUATIONS[evalId] || state.customEvaluations.find(c => c.id === evalId);
    if (meta) {
      const section = document.createElement("div");
      section.className = "assessment-section";
      section.setAttribute("data-eval-id", evalId);
      
      section.innerHTML = `
        <div class="assessment-section-header">
          <h3 style="font-size:16px; color:var(--text-primary);">${escapeHtml(meta.name)}</h3>
        </div>
        <p style="font-size: 11px; color: var(--text-muted); margin-bottom:12px;">${escapeHtml(meta.description || '')}</p>
      `;

      // 採点ヘルプアコーディオン (説明/ガイドラインがある場合)
      if (meta.guideline) {
        const accordionHeader = document.createElement("div");
        accordionHeader.className = "accordion-header";
        accordionHeader.innerHTML = `<span>判定ガイド・基準を確認する</span><span class="chevron">▼</span>`;
        
        const accordionContent = document.createElement("div");
        accordionContent.className = "accordion-content";
        accordionContent.textContent = meta.guideline;

        accordionHeader.addEventListener("click", () => {
          accordionHeader.classList.toggle("active");
        });

        section.appendChild(accordionHeader);
        section.appendChild(accordionContent);
      }

      // 各 inputType に応じた入力UIの追加
      buildInputFormUI(section, evalId, meta);
      formContainer.appendChild(section);
    }
  });

  // UI切り替え
  document.getElementById("assessment-step-select").style.display = "none";
  document.getElementById("assessment-step-form").style.display = "block";
}

function buildInputFormUI(section, evalId, meta) {
  const container = document.createElement("div");
  container.className = "eval-input-ui-container";

  // 1. 複数項目スケール（BBS, FMA, SIAS, SCP, TIS, TCT など）
  if (meta.inputType === "multi_scale") {
    let totalScoreElId = `total-${evalId}`;
    
    // 合計値インジケーター
    const totalIndicator = document.createElement("div");
    totalIndicator.className = "computed-output-box";
    totalIndicator.style.marginBottom = "14px";
    totalIndicator.innerHTML = `現在の合計点: <span class="computed-val" id="${totalScoreElId}">0</span> 点`;
    container.appendChild(totalIndicator);

    // 各設問項目
    meta.items.forEach(item => {
      const itemEl = document.createElement("div");
      itemEl.className = "scale-item";
      itemEl.setAttribute("data-item-id", item.id);
      
      itemEl.innerHTML = `
        <div class="scale-item-title">${escapeHtml(item.name)}</div>
      `;

      // 選択肢 (0〜4点などのボタンリスト)
      const choicesContainer = document.createElement("div");
      choicesContainer.className = "scoring-choices";

      // 選択状態保存用 hidden input
      const hiddenInput = document.createElement("input");
      hiddenInput.type = "hidden";
      hiddenInput.name = `${evalId}_${item.id}`;
      hiddenInput.required = true;
      choicesContainer.appendChild(hiddenInput);

      Object.keys(item.criteria).forEach(score => {
        const choice = document.createElement("div");
        choice.className = "score-choice";
        choice.innerHTML = `
          <span class="score-num">${score}</span>
          <span class="score-desc">${escapeHtml(item.criteria[score])}</span>
        `;
        choice.addEventListener("click", () => {
          // すべての選択を解除
          choicesContainer.querySelectorAll(".score-choice").forEach(c => c.classList.remove("selected"));
          // 今回選択したものをハイライト
          choice.classList.add("selected");
          hiddenInput.value = score;
          
          // 合計点の再計算
          recalculateMultiScaleTotal(evalId, meta);
        });
        choicesContainer.appendChild(choice);
      });

      itemEl.appendChild(choicesContainer);
      container.appendChild(itemEl);
    });
  } 
  // 2. 関節可動域 (ROM) 特殊入力
  else if (meta.inputType === "rom") {
    Object.keys(meta.subItems).forEach(key => {
      const subItem = meta.subItems[key];
      const itemEl = document.createElement("div");
      itemEl.style.padding = "10px 0";
      itemEl.style.borderBottom = "1px solid var(--border-color)";
      
      itemEl.innerHTML = `
        <div style="font-size:13px; font-weight:600;">${escapeHtml(subItem.name)} (${subItem.unit})</div>
        <div class="rom-side-container">
          <div class="rom-side-box left">
            <div class="rom-side-title">左 (麻痺/患側など)</div>
            <div class="rom-angle-input">
              <input type="number" name="${evalId}_${key}_left" class="form-control" placeholder="${subItem.defaultLeft}" min="-20" max="360">
            </div>
          </div>
          <div class="rom-side-box right">
            <div class="rom-side-title">右 (健側など)</div>
            <div class="rom-angle-input">
              <input type="number" name="${evalId}_${key}_right" class="form-control" placeholder="${subItem.defaultRight}" min="-20" max="360">
            </div>
          </div>
        </div>
      `;
      container.appendChild(itemEl);
    });
  }
  // 3. 左右対称数値入力 (膝伸展筋力、握力など)
  else if (meta.inputType === "bilateral_numeric") {
    container.innerHTML = `
      <div class="rom-side-container" style="margin-top:0;">
        <div class="rom-side-box left">
          <div class="rom-side-title">左</div>
          <input type="number" step="0.1" name="${evalId}_left" class="form-control" placeholder="数値" required>
        </div>
        <div class="rom-side-box right">
          <div class="rom-side-title">右</div>
          <input type="number" step="0.1" name="${evalId}_right" class="form-control" placeholder="数値" required>
        </div>
      </div>
    `;
  }
  // 4. 歩行比率計算 (10m歩行)
  else if (meta.inputType === "walk_10m_calc") {
    const speedId = `${evalId}_speed_computed`;
    const strideId = `${evalId}_stride_computed`;

    container.innerHTML = `
      <div class="walk-10m-grid">
        <div class="form-group">
          <label>かかった時間 (秒)</label>
          <input type="number" step="0.01" name="${evalId}_time" id="${evalId}_time" class="form-control" placeholder="秒" required>
        </div>
        <div class="form-group">
          <label>歩数 (歩)</label>
          <input type="number" step="1" name="${evalId}_steps" id="${evalId}_steps" class="form-control" placeholder="歩" required>
        </div>
      </div>
      <!-- タイマー簡易UI -->
      <div class="timer-container">
        <div class="timer-display" id="10m-timer-display">00.00</div>
        <div class="timer-controls">
          <button type="button" class="btn btn-secondary timer-btn" id="10m-timer-start">スタート</button>
          <button type="button" class="btn btn-secondary timer-btn" id="10m-timer-reset">リセット</button>
        </div>
      </div>
      <div class="computed-output-box">
        <div>歩行速度 (自動計算): <span class="computed-val" id="${speedId}">--</span> m/min</div>
        <div>平均歩幅 (自動計算): <span class="computed-val" id="${strideId}">--</span> cm</div>
      </div>
    `;

    // 計算のリアルタイム連動
    setTimeout(() => {
      const timeInput = document.getElementById(`${evalId}_time`);
      const stepsInput = document.getElementById(`${evalId}_steps`);
      
      const calc = () => {
        const sec = parseFloat(timeInput.value);
        const steps = parseInt(stepsInput.value);
        if (sec > 0) {
          const speed = (600 / sec).toFixed(1); // 10mの速度 m/min
          document.getElementById(speedId).textContent = speed;
          if (steps > 0) {
            const stride = (1000 / steps).toFixed(1); // 10mの歩幅 cm
            document.getElementById(strideId).textContent = stride;
          }
        }
      };
      
      timeInput.addEventListener("input", calc);
      stepsInput.addEventListener("input", calc);

      // タイマーコントロール
      setupTimerControls("10m-timer-display", "10m-timer-start", "10m-timer-reset", (timeSec) => {
        timeInput.value = timeSec.toFixed(2);
        calc();
      });
    }, 100);
  }
  // 5. タイマー機能付き数値 (TUG)
  else if (meta.inputType === "timer_numeric") {
    container.innerHTML = `
      <div class="form-group">
        <label>測定値 (秒)</label>
        <input type="number" step="0.01" name="${evalId}_time" id="${evalId}_time" class="form-control" placeholder="秒" required>
      </div>
      <div class="timer-container">
        <div class="timer-display" id="tug-timer-display">00.00</div>
        <div class="timer-controls">
          <button type="button" class="btn btn-secondary timer-btn" id="tug-timer-start">スタート</button>
          <button type="button" class="btn btn-secondary timer-btn" id="tug-timer-reset">リセット</button>
        </div>
      </div>
    `;

    setTimeout(() => {
      const timeInput = document.getElementById(`${evalId}_time`);
      setupTimerControls("tug-timer-display", "tug-timer-start", "tug-timer-reset", (timeSec) => {
        timeInput.value = timeSec.toFixed(2);
      });
    }, 100);
  }
  // 6. 6分間歩行
  else if (meta.inputType === "walk_6min_custom") {
    let borgBeforeOpts = meta.borgOptions.map(o => `<option value="${o.value}">${o.label}</option>`).join("");
    let borgAfterOpts = meta.borgOptions.map(o => `<option value="${o.value}">${o.label}</option>`).join("");

    container.innerHTML = `
      <div class="form-group">
        <label>歩行距離 (メートル)</label>
        <input type="number" name="${evalId}_distance" class="form-control" placeholder="m" required>
      </div>
      <div class="walk-10m-grid">
        <div class="form-group">
          <label>開始前 Borg指数</label>
          <select name="${evalId}_borg_before">
            ${borgBeforeOpts}
          </select>
        </div>
        <div class="form-group">
          <label>終了後 Borg指数</label>
          <select name="${evalId}_borg_after">
            ${borgAfterOpts}
          </select>
        </div>
      </div>
    `;
  }
  // 7. 単一選択 (FAC)
  else if (meta.inputType === "single_select") {
    container.className = "scoring-choices";
    
    // 状態保存用 hidden
    const hiddenInput = document.createElement("input");
    hiddenInput.type = "hidden";
    hiddenInput.name = `${evalId}_score`;
    hiddenInput.required = true;
    container.appendChild(hiddenInput);

    meta.options.forEach(opt => {
      const choice = document.createElement("div");
      choice.className = "score-choice";
      choice.innerHTML = `
        <span class="score-num">${opt.value}</span>
        <span class="score-desc" style="font-weight:600; color:var(--text-primary);">${escapeHtml(opt.label)}<br>
          <small style="font-weight:400; color:var(--text-secondary);">${escapeHtml(opt.desc)}</small>
        </span>
      `;
      choice.addEventListener("click", () => {
        container.querySelectorAll(".score-choice").forEach(c => c.classList.remove("selected"));
        choice.classList.add("selected");
        hiddenInput.value = opt.value;
      });
      container.appendChild(choice);
    });
  }
  // 8. BRS 独自UI
  else if (meta.inputType === "brs_custom") {
    container.innerHTML = "";
    
    const parts = ["arm", "hand", "leg"];
    const labels = { arm: "上肢", hand: "手指", leg: "下肢" };

    parts.forEach(part => {
      const partBox = document.createElement("div");
      partBox.style.marginBottom = "14px";
      partBox.style.paddingBottom = "10px";
      partBox.style.borderBottom = "1px solid var(--border-color)";

      partBox.innerHTML = `
        <div style="font-size:13px; font-weight:600; margin-bottom:6px;">${labels[part]}回復段階</div>
        <select name="${evalId}_${part}" id="brs_${part}_select" required>
          <option value="">段階を選択してください</option>
          ${meta.stages.map(st => `<option value="${st}">Stage ${st}</option>`).join("")}
        </select>
        <div class="computed-output-box" id="brs_${part}_desc" style="font-size: 11px; display:none; white-space:pre-line;">
        </div>
      `;

      setTimeout(() => {
        const select = document.getElementById(`brs_${part}_select`);
        const descBox = document.getElementById(`brs_${part}_desc`);
        select.addEventListener("change", (e) => {
          const val = e.target.value;
          if (val) {
            descBox.textContent = meta.criteria[part][val];
            descBox.style.display = "block";
          } else {
            descBox.style.display = "none";
          }
        });
      }, 100);

      container.appendChild(partBox);
    });
  }
  // 9. MAS 独自UI
  else if (meta.inputType === "mas_custom") {
    let masOpts = meta.options.map(o => `<option value="${o.value}">${o.label}</option>`).join("");
    
    container.innerHTML = `
      <div class="form-group">
        <label>評価対象筋 (例: 右肘屈筋、左膝伸展筋など)</label>
        <input type="text" name="${evalId}_target_muscle" class="form-control" placeholder="対象筋肉名を入力" required>
      </div>
      <div class="form-group">
        <label>MAS スコア</label>
        <select name="${evalId}_score" id="mas_score_select" required>
          <option value="">緊張の段階を選択</option>
          ${masOpts}
        </select>
      </div>
      <div class="computed-output-box" id="mas_desc_box" style="font-size:11px; display:none;"></div>
    `;

    setTimeout(() => {
      const select = document.getElementById("mas_score_select");
      const descBox = document.getElementById("mas_desc_box");
      select.addEventListener("change", (e) => {
        const val = e.target.value;
        if (val) {
          const opt = meta.options.find(o => o.value === val);
          descBox.textContent = opt ? opt.desc : "";
          descBox.style.display = "block";
        } else {
          descBox.style.display = "none";
        }
      });
    }, 100);
  }
  // 9-2. STEF 独自UI
  else if (meta.inputType === "stef_custom") {
    // 左右の合計点インジケーター
    const totalIndicator = document.createElement("div");
    totalIndicator.className = "computed-output-box";
    totalIndicator.style.marginBottom = "14px";
    totalIndicator.innerHTML = `
      現在の合計点 - 
      左: <span class="computed-val" id="stef-left-total">0</span> 点 / 
      右: <span class="computed-val" id="stef-right-total">0</span> 点
    `;
    container.appendChild(totalIndicator);

    // 点数選択用のオプションHTML (1〜10点)
    let scoreOptions = `<option value="">点数</option>`;
    for (let i = 1; i <= 10; i++) {
      scoreOptions += `<option value="${i}">${i}点</option>`;
    }

    meta.items.forEach(item => {
      const itemEl = document.createElement("div");
      itemEl.style.padding = "12px 0";
      itemEl.style.borderBottom = "1px solid var(--border-color)";
      
      itemEl.innerHTML = `
        <div style="font-size:13px; font-weight:600; margin-bottom:8px;">${escapeHtml(item.name)}</div>
        <div class="rom-side-container">
          <div class="rom-side-box left">
            <div class="rom-side-title">左</div>
            <div style="display:flex; gap:6px;">
              <input type="number" step="0.1" name="${evalId}_${item.id}_time_left" class="form-control" style="padding:8px;" placeholder="秒">
              <select name="${evalId}_${item.id}_score_left" class="stef-score-select-left" style="padding:8px;">
                ${scoreOptions}
              </select>
            </div>
          </div>
          <div class="rom-side-box right">
            <div class="rom-side-title">右</div>
            <div style="display:flex; gap:6px;">
              <input type="number" step="0.1" name="${evalId}_${item.id}_time_right" class="form-control" style="padding:8px;" placeholder="秒">
              <select name="${evalId}_${item.id}_score_right" class="stef-score-select-right" style="padding:8px;">
                ${scoreOptions}
              </select>
            </div>
          </div>
        </div>
      `;
      container.appendChild(itemEl);
    });

    // リアルタイム合計計算イベント
    setTimeout(() => {
      const recalcStef = () => {
        let leftSum = 0;
        let rightSum = 0;
        document.querySelectorAll(".stef-score-select-left").forEach(sel => {
          if (sel.value) leftSum += parseInt(sel.value);
        });
        document.querySelectorAll(".stef-score-select-right").forEach(sel => {
          if (sel.value) rightSum += parseInt(sel.value);
        });
        document.getElementById("stef-left-total").textContent = leftSum;
        document.getElementById("stef-right-total").textContent = rightSum;
      };

      container.querySelectorAll("select").forEach(sel => {
        sel.addEventListener("change", recalcStef);
      });
    }, 100);
  }
  // 9-3. MAL 独自UI
  else if (meta.inputType === "mal_custom") {
    // 平均値インジケーター
    const meanIndicator = document.createElement("div");
    meanIndicator.className = "computed-output-box";
    meanIndicator.style.marginBottom = "14px";
    meanIndicator.innerHTML = `
      現在の平均値 - 
      AOU (頻度): <span class="computed-val" id="mal-aou-mean">--</span> / 
      QOM (質): <span class="computed-val" id="mal-qom-mean">--</span>
    `;
    container.appendChild(meanIndicator);

    // 0〜5点のセレクトオプション
    let aouOpts = `<option value="">AOU (頻度)</option>`;
    Object.keys(meta.scales.aou).forEach(k => {
      aouOpts += `<option value="${k}">${meta.scales.aou[k]}</option>`;
    });

    let qomOpts = `<option value="">QOM (質)</option>`;
    Object.keys(meta.scales.qom).forEach(k => {
      qomOpts += `<option value="${k}">${meta.scales.qom[k]}</option>`;
    });

    meta.actions.forEach(action => {
      const itemEl = document.createElement("div");
      itemEl.style.padding = "14px 0";
      itemEl.style.borderBottom = "1px solid var(--border-color)";
      
      itemEl.innerHTML = `
        <div style="font-size:13px; font-weight:600; margin-bottom:6px;">${escapeHtml(action.name)}</div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
          <div>
            <select name="${evalId}_${action.id}_aou" class="mal-aou-select">
              ${aouOpts}
            </select>
          </div>
          <div>
            <select name="${evalId}_${action.id}_qom" class="mal-qom-select">
              ${qomOpts}
            </select>
          </div>
        </div>
      `;
      container.appendChild(itemEl);
    });

    // リアルタイム平均計算イベント
    setTimeout(() => {
      const recalcMal = () => {
        let aouSum = 0;
        let aouCount = 0;
        let qomSum = 0;
        let qomCount = 0;

        document.querySelectorAll(".mal-aou-select").forEach(sel => {
          if (sel.value !== "") {
            aouSum += parseFloat(sel.value);
            aouCount++;
          }
        });

        document.querySelectorAll(".mal-qom-select").forEach(sel => {
          if (sel.value !== "") {
            qomSum += parseFloat(sel.value);
            qomCount++;
          }
        });

        document.getElementById("mal-aou-mean").textContent = aouCount > 0 ? (aouSum / aouCount).toFixed(2) : "--";
        document.getElementById("mal-qom-mean").textContent = qomCount > 0 ? (qomSum / qomCount).toFixed(2) : "--";
      };

      container.querySelectorAll("select").forEach(sel => {
        sel.addEventListener("change", recalcMal);
      });
    }, 100);
  }
  // 10. カスタム項目または汎用数値型
  else {
    const unit = meta.unit || "";
    container.innerHTML = `
      <div class="form-group">
        <label>測定値 (${unit})</label>
        <input type="number" step="0.1" name="${evalId}_score" class="form-control" placeholder="数値を入力" required>
      </div>
      <div class="form-group">
        <label>メモ / 備考</label>
        <input type="text" name="${evalId}_memo" class="form-control" placeholder="測定時の特記情報など">
      </div>
    `;
  }

  section.appendChild(container);
}

// 複数項目スケールの合計点リアルタイム再計算
function recalculateMultiScaleTotal(evalId, meta) {
  let sum = 0;
  let allSelected = true;

  meta.items.forEach(item => {
    const input = document.querySelector(`input[name="${evalId}_${item.id}"]`);
    if (input && input.value !== "") {
      sum += parseFloat(input.value);
    } else {
      allSelected = false;
    }
  });

  const totalEl = document.getElementById(`total-${evalId}`);
  if (totalEl) {
    totalEl.textContent = sum;
  }
}

// ストップウォッチ（タイマー）ユーティリティ
function setupTimerControls(displayId, startBtnId, resetBtnId, onTickCallback) {
  const display = document.getElementById(displayId);
  const startBtn = document.getElementById(startBtnId);
  const resetBtn = document.getElementById(resetBtnId);

  let isRunning = false;

  const updateDisplay = () => {
    const totalMs = isRunning ? (Date.now() - timerStart + timerElapsed) : timerElapsed;
    const sec = totalMs / 1000;
    display.textContent = sec.toFixed(2);
    if (onTickCallback) {
      onTickCallback(sec);
    }
  };

  startBtn.addEventListener("click", () => {
    if (isRunning) {
      // ストップ
      isRunning = false;
      clearInterval(timerInterval);
      timerElapsed += Date.now() - timerStart;
      startBtn.textContent = "再開";
      startBtn.classList.remove("btn-danger");
      startBtn.classList.add("btn-green");
    } else {
      // スタート
      isRunning = true;
      timerStart = Date.now();
      timerInterval = setInterval(updateDisplay, 37); // 約27FPSで更新
      startBtn.textContent = "ストップ";
      startBtn.classList.remove("btn-green");
      startBtn.classList.add("btn-danger");
    }
  });

  resetBtn.addEventListener("click", () => {
    isRunning = false;
    clearInterval(timerInterval);
    timerElapsed = 0;
    timerStart = 0;
    startBtn.textContent = "スタート";
    startBtn.classList.remove("btn-danger");
    startBtn.classList.remove("btn-green");
    display.textContent = "00.00";
    if (onTickCallback) {
      onTickCallback(0);
    }
  });
}

// 評価データの送信・収集・保存
function handleAssessmentSubmit(e) {
  e.preventDefault();
  
  const pIndex = state.currentPatientIndex;
  if (pIndex < 0) return;

  const date = document.getElementById("assessment-date").value;
  const evaluator = document.getElementById("assessment-evaluator").value.trim();

  if (!date) {
    alert("日付を入力してください。");
    return;
  }

  // アクティブな評価フォームのデータ収集
  const evaluations = {};
  const activeSections = document.querySelectorAll("#dynamic-assessment-inputs .assessment-section");

  activeSections.forEach(section => {
    const evalId = section.getAttribute("data-eval-id");
    const meta = PRESET_EVALUATIONS[evalId] || state.customEvaluations.find(c => c.id === evalId);
    
    if (meta) {
      const data = {};

      if (meta.inputType === "multi_scale") {
        let total = 0;
        meta.items.forEach(item => {
          const val = parseFloat(document.querySelector(`input[name="${evalId}_${item.id}"]`).value);
          data[item.id] = val;
          total += val;
        });
        data.total = total;

        // 特殊合計 (FMA / SIAS / TIS / ARAT / SCIM / AIS / JOA等)
        if (evalId === "fma") {
          data.arm_total = data.ue_reflex + data.ue_flex_syn + data.ue_ext_syn + data.ue_mix + data.ue_sepa + data.ue_normal_ref + data.ue_wrist + data.ue_hand + data.ue_coord;
          data.leg_total = data.le_reflex + data.le_flex_syn + data.le_ext_syn + data.le_mix + data.le_sepa + data.le_normal_ref + data.le_coord;
        } else if (evalId === "sias") {
          data.motor_total = data.m_hip + data.m_knee + data.m_foot + data.m_proximal + data.m_distal;
          data.sensory_total = data.s_touch + data.s_position;
        } else if (evalId === "tis") {
          data.static_bal = data.static_bal || 0;
          data.dynamic_bal = data.dynamic_bal || 0;
          data.coordination = data.coordination || 0;
        } else if (evalId === "arat") {
          data.grasp_sub = (data.g1 || 0) + (data.g2 || 0) + (data.g3 || 0) + (data.g4 || 0) + (data.g5 || 0) + (data.g6 || 0);
          data.grip_sub = (data.gr1 || 0) + (data.gr2 || 0) + (data.gr3 || 0) + (data.gr4 || 0);
          data.pinch_sub = (data.p1 || 0) + (data.p2 || 0) + (data.p3 || 0) + (data.p4 || 0) + (data.p5 || 0) + (data.p6 || 0);
          data.gross_sub = (data.gm1 || 0) + (data.gm2 || 0) + (data.gm3 || 0);
        } else if (evalId === "scim") {
          data.self_care = (data.q1_feeding || 0) + (data.q2_bathing_upper || 0) + (data.q3_bathing_lower || 0) + (data.q4_dressing_upper || 0) + (data.q5_dressing_lower || 0) + (data.q6_grooming || 0);
          data.respiration_sphincter = (data.q7_respiration || 0) + (data.q8_sphincter_urine || 0) + (data.q9_sphincter_bowel || 0) + (data.q10_toilet_use || 0);
          data.mobility = (data.q11_mobility_bed || 0) + (data.q12_mobility_transfers || 0) + (data.q13_mobility_toilet || 0) + (data.q14_mobility_car || 0) + (data.q15_mobility_ground || 0) + (data.q16_mobility_ground_long || 0) + (data.q17_mobility_stairs || 0) + (data.q18_mobility_transfers_floor || 0);
        } else if (evalId === "ais") {
          data.uems = (data.uems_c5 || 0) + (data.uems_c6 || 0) + (data.uems_c7 || 0) + (data.uems_c8 || 0) + (data.uems_t1 || 0);
          data.lems = (data.lems_l2 || 0) + (data.lems_l3 || 0) + (data.lems_l4 || 0) + (data.lems_l5 || 0) + (data.lems_s1 || 0);
          data.motor_total = data.uems + data.lems;
          data.total = data.motor_total; // 合計値を運動合計点に設定
        } else if (evalId === "joa_hip") {
          data.pain = data.pain || 0;
          data.rom = data.rom || 0;
          data.walking = data.walking || 0;
          data.adl = data.adl || 0;
        } else if (evalId === "joa_knee") {
          data.pain_walking = data.pain_walking || 0;
          data.stairs = data.stairs || 0;
          data.rom_limitation = data.rom_limitation || 0;
          data.swelling = data.swelling || 0;
        } else if (evalId === "joa_back") {
          data.symptoms = data.symptoms || 0;
          data.findings = data.findings || 0;
          data.adl_back = data.adl_back || 0;
        } else if (evalId === "bls") {
          // 仰臥位 + 両方向追加点 + その他項目の単純合計
          data.total = (data.rolling || 0) + (data.rolling_both || 0) + (data.sitting || 0) + (data.standing || 0) + (data.transfers || 0) + (data.walking || 0);
        } else if (evalId === "joa_shoulder") {
          data.total = (data.pain || 0) + (data.rom || 0) + (data.function || 0) + (data.support || 0) + (data.xray || 0);
        } else if (evalId === "sara") {
          const chase_mean = ((data.chase_left || 0) + (data.chase_right || 0)) / 2;
          const nose_mean = ((data.nose_left || 0) + (data.nose_right || 0)) / 2;
          const rotation_mean = ((data.rotation_left || 0) + (data.rotation_right || 0)) / 2;
          const shin_mean = ((data.shin_left || 0) + (data.shin_right || 0)) / 2;
          data.total = (data.gait || 0) + (data.stance || 0) + (data.sitting || 0) + (data.speech || 0) + chase_mean + nose_mean + rotation_mean + shin_mean;
        }
      } 
      else if (meta.inputType === "rom") {
        Object.keys(meta.subItems).forEach(key => {
          const lVal = document.querySelector(`input[name="${evalId}_${key}_left"]`).value;
          const rVal = document.querySelector(`input[name="${evalId}_${key}_right"]`).value;
          
          data[key] = {
            left: lVal !== "" ? parseInt(lVal) : null,
            right: rVal !== "" ? parseInt(rVal) : null
          };
        });
      }
      else if (meta.inputType === "bilateral_numeric") {
        const lVal = document.querySelector(`input[name="${evalId}_left"]`).value;
        const rVal = document.querySelector(`input[name="${evalId}_right"]`).value;
        data.left = lVal !== "" ? parseFloat(lVal) : null;
        data.right = rVal !== "" ? parseFloat(rVal) : null;
      }
      else if (meta.inputType === "walk_10m_calc") {
        const sec = parseFloat(document.getElementById(`${evalId}_time`).value);
        const steps = parseInt(document.getElementById(`${evalId}_steps`).value);
        data.time = sec;
        data.steps = steps;
        // 速度と歩幅を再計算
        data.speed = sec > 0 ? parseFloat((600 / sec).toFixed(1)) : 0;
        data.stride = steps > 0 ? parseFloat((1000 / steps).toFixed(1)) : 0;
      }
      else if (meta.inputType === "timer_numeric") {
        data.time = parseFloat(document.getElementById(`${evalId}_time`).value);
      }
      else if (meta.inputType === "walk_6min_custom") {
        data.distance = parseInt(document.querySelector(`input[name="${evalId}_distance"]`).value);
        data.borg_before = parseInt(document.querySelector(`select[name="${evalId}_borg_before"]`).value);
        data.borg_after = parseInt(document.querySelector(`select[name="${evalId}_borg_after"]`).value);
      }
      else if (meta.inputType === "single_select") {
        data.score = parseInt(document.querySelector(`input[name="${evalId}_score"]`).value);
      }
      else if (meta.inputType === "brs_custom") {
        data.arm = document.querySelector(`select[name="${evalId}_arm"]`).value;
        data.hand = document.querySelector(`select[name="${evalId}_hand"]`).value;
        data.leg = document.querySelector(`select[name="${evalId}_leg"]`).value;
      }
      else if (meta.inputType === "mas_custom") {
        data.target_muscle = document.querySelector(`input[name="${evalId}_target_muscle"]`).value.trim();
        data.score = document.querySelector(`select[name="${evalId}_score"]`).value;
      }
      else if (meta.inputType === "stef_custom") {
        let leftTotal = 0;
        let rightTotal = 0;
        meta.items.forEach(item => {
          const tL = document.querySelector(`input[name="${evalId}_${item.id}_time_left"]`).value;
          const sL = document.querySelector(`select[name="${evalId}_${item.id}_score_left"]`).value;
          const tR = document.querySelector(`input[name="${evalId}_${item.id}_time_right"]`).value;
          const sR = document.querySelector(`select[name="${evalId}_${item.id}_score_right"]`).value;

          const scoreL = sL !== "" ? parseInt(sL) : null;
          const scoreR = sR !== "" ? parseInt(sR) : null;

          data[item.id] = {
            time_left: tL !== "" ? parseFloat(tL) : null,
            score_left: scoreL,
            time_right: tR !== "" ? parseFloat(tR) : null,
            score_right: scoreR
          };

          if (scoreL !== null) leftTotal += scoreL;
          if (scoreR !== null) rightTotal += scoreR;
        });
        data.left_total = leftTotal;
        data.right_total = rightTotal;
      }
      else if (meta.inputType === "mal_custom") {
        let aouSum = 0;
        let aouCount = 0;
        let qomSum = 0;
        let qomCount = 0;

        meta.actions.forEach(act => {
          const aouVal = document.querySelector(`select[name="${evalId}_${act.id}_aou"]`).value;
          const qomVal = document.querySelector(`select[name="${evalId}_${act.id}_qom"]`).value;

          const aou = aouVal !== "" ? parseInt(aouVal) : null;
          const qom = qomVal !== "" ? parseInt(qomVal) : null;

          data[act.id] = { aou, qom };

          if (aou !== null) {
            aouSum += aou;
            aouCount++;
          }
          if (qom !== null) {
            qomSum += qom;
            qomCount++;
          }
        });

        data.aou_mean = aouCount > 0 ? parseFloat((aouSum / aouCount).toFixed(2)) : 0;
        data.qom_mean = qomCount > 0 ? parseFloat((qomSum / qomCount).toFixed(2)) : 0;
      }
      else {
        // カスタムまたは数値1つ
        data.score = parseFloat(document.querySelector(`input[name="${evalId}_score"]`).value);
        data.memo = document.querySelector(`input[name="${evalId}_memo"]`).value.trim();
      }

      evaluations[evalId] = data;
    }
  });

  // レコードの登録
  const record = {
    date,
    evaluator,
    evaluations
  };

  // 編集モードか新規登録モードかで保存処理を分岐
  if (state.editingRecordIndex >= 0) {
    // 既存レコードの上書き更新
    state.patients[pIndex].records[state.editingRecordIndex] = record;
    state.editingRecordIndex = -1; // 編集モード解除
    alert("測定記録を修正・更新しました。");
  } else {
    // 新規登録：同じ日付の重複チェック
    const existingRecordIndex = state.patients[pIndex].records.findIndex(r => r.date === date);
    if (existingRecordIndex >= 0) {
      if (confirm(`${date} の測定記録はすでに存在します。上書きしますか？`)) {
        state.patients[pIndex].records[existingRecordIndex] = record;
      } else {
        return; // キャンセル
      }
    } else {
      state.patients[pIndex].records.push(record);
    }
  }

  savePatients();
  
  // 詳細画面に戻りリフレッシュ
  showPatientDetail(pIndex);
}

// -------------------------------------------------------------
// カスタマイズ・設定ロジック
// -------------------------------------------------------------

function handleCustomEvalSubmit(e) {
  e.preventDefault();
  const name = document.getElementById("custom-name").value.trim();
  const unit = document.getElementById("custom-unit").value.trim();
  const desc = document.getElementById("custom-description").value.trim();

  if (!name) return;

  const id = `custom_${Date.now()}`;
  const newItem = {
    id,
    name,
    unit,
    category: "カスタム項目",
    description: desc,
    inputType: "generic_numeric", // カスタムは簡易数値入力とする
    isCustom: true
  };

  state.customEvaluations.push(newItem);
  saveCustomEvaluations();
  
  document.getElementById("custom-eval-form").reset();
  renderCustomEvaluationsList();
}

function renderCustomEvaluationsList() {
  const container = document.getElementById("custom-evals-list");
  if (!container) return;
  container.innerHTML = "";

  if (state.customEvaluations.length === 0) {
    container.innerHTML = '<p style="font-size:12px; color:var(--text-muted);">追加されたカスタム評価はありません。</p>';
    return;
  }

  state.customEvaluations.forEach(item => {
    const el = document.createElement("div");
    el.style.display = "flex";
    el.style.justify = "space-between";
    el.style.alignItems = "center";
    el.style.padding = "8px 12px";
    el.style.backgroundColor = "rgba(255,255,255,0.02)";
    el.style.border = "1px solid var(--border-color)";
    el.style.borderRadius = "8px";
    el.style.marginBottom = "8px";

    el.innerHTML = `
      <div>
        <div style="font-size: 13px; font-weight:600;">${escapeHtml(item.name)} (${escapeHtml(item.unit)})</div>
        <div style="font-size: 11px; color:var(--text-secondary);">${escapeHtml(item.description || "説明なし")}</div>
      </div>
      <button class="btn btn-danger" style="width:auto; padding: 4px 8px; font-size:11px;" onclick="deleteCustomEval('${item.id}')">削除</button>
    `;
    container.appendChild(el);
  });
}

// グローバルスコープにするために window に紐付け
window.deleteCustomEval = function(id) {
  if (confirm("このカスタム評価項目を削除しますか？ (既存の測定履歴データは保持されます)")) {
    state.customEvaluations = state.customEvaluations.filter(c => c.id !== id);
    saveCustomEvaluations();
    renderCustomEvaluationsList();
  }
};

// JSON データエクスポート
function exportData() {
  const dataStr = JSON.stringify({
    patients: state.patients,
    customEvaluations: state.customEvaluations,
    exportDate: new Date().toISOString()
  }, null, 2);

  const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
  const exportFileDefaultName = `rehareco_backup_${new Date().toISOString().split('T')[0]}.json`;

  const linkElement = document.createElement('a');
  linkElement.setAttribute('href', dataUri);
  linkElement.setAttribute('download', exportFileDefaultName);
  linkElement.click();
}

// CSV データエクスポート
function exportDataCSV() {
  if (!state.patients || state.patients.length === 0) {
    alert("エクスポートするデータがありません。");
    return;
  }

  const csvRows = [];
  // ヘッダー列
  csvRows.push(['患者ID', '年齢', '性別', '診断名', '測定日', '測定者', '評価ID', '評価項目名', '総合点/代表値', '詳細スコア'].map(v => `"${v}"`).join(','));

  state.patients.forEach(p => {
    (p.records || []).forEach(r => {
      Object.keys(r.evaluations || {}).forEach(evalId => {
        const evalData = r.evaluations[evalId];
        const meta = PRESET_EVALUATIONS[evalId] || state.customEvaluations.find(c => c.id === evalId);
        const evalName = meta ? meta.name : evalId;
        
        let scoreStr = "";
        let detailStr = "";
        
        if (typeof evalData === "object" && evalData !== null) {
          if (evalData.total !== undefined) {
            scoreStr = `${evalData.total}点`;
          } else if (evalData.score !== undefined) {
            scoreStr = `${evalData.score}`;
          } else if (evalData.time !== undefined) {
            scoreStr = `${evalData.time}秒`;
          } else {
            scoreStr = "記録あり";
          }
          
          // 内訳テキストの作成
          const details = [];
          Object.keys(evalData).forEach(k => {
            if (k === "total" || k === "score") return;
            const val = evalData[k];
            if (typeof val === "object" && val !== null) {
              details.push(`${k}(左:${val.left}/右:${val.right})`);
            } else {
              details.push(`${k}:${val}`);
            }
          });
          detailStr = details.join('; ');
        } else {
          scoreStr = String(evalData);
        }
        
        const row = [
          p.id,
          p.age || '',
          p.gender || '',
          p.diagnosis || '',
          r.date || '',
          r.evaluator || '',
          evalId,
          evalName,
          scoreStr,
          detailStr
        ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
        
        csvRows.push(row);
      });
    });
  });

  // UTF-8 BOM (\uFEFF) を付与して Excel での日本語文字化けを防ぐ
  const csvContent = "\uFEFF" + csvRows.join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  
  const linkElement = document.createElement("a");
  const url = URL.createObjectURL(blob);
  const exportFileDefaultName = `rehareco_export_${new Date().toISOString().split('T')[0]}.csv`;
  
  linkElement.setAttribute("href", url);
  linkElement.setAttribute("download", exportFileDefaultName);
  linkElement.click();
}

// JSON データインポート
function importData(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(evt) {
    try {
      const data = JSON.parse(evt.target.result);
      if (data.patients && Array.isArray(data.patients)) {
        if (confirm("データをインポートします。現在のデータは上書き・統合されますが、よろしいですか？")) {
          // マージ処理
          data.patients.forEach(impP => {
            const matchIdx = state.patients.findIndex(p => p.id === impP.id);
            if (matchIdx >= 0) {
              // 既存患者の場合、レコードをマージ（同じ日付はインポート側優先）
              impP.records.forEach(impR => {
                const rMatchIdx = state.patients[matchIdx].records.findIndex(r => r.date === impR.date);
                if (rMatchIdx >= 0) {
                  state.patients[matchIdx].records[rMatchIdx] = impR;
                } else {
                  state.patients[matchIdx].records.push(impR);
                }
              });
            } else {
              // 新規患者
              state.patients.push(impP);
            }
          });

          // カスタム評価のマージ
          if (data.customEvaluations && Array.isArray(data.customEvaluations)) {
            data.customEvaluations.forEach(impC => {
              if (!state.customEvaluations.some(c => c.id === impC.id)) {
                state.customEvaluations.push(impC);
              }
            });
          }

          savePatients();
          saveCustomEvaluations();
          renderPatientsList();
          renderCustomEvaluationsList();
          alert("インポートが成功しました。");
        }
      } else {
        alert("無効なバックアップファイルフォーマットです。");
      }
    } catch (err) {
      alert("ファイルの解析に失敗しました。JSONファイルであることを確認してください。");
    }
  };
  reader.readAsText(file);
}

// 全データ初期化
function clearAllData() {
  if (confirm("警告: すべての患者データ、測定履歴、カスタム設定が完全に消去されます。この操作は取り消せません。続行しますか？")) {
    localStorage.removeItem("rehareco_patients");
    localStorage.removeItem("rehareco_custom_evaluations");
    state.patients = [];
    state.customEvaluations = [];
    renderPatientsList();
    renderCustomEvaluationsList();
    switchView("view-patients");
    alert("データをすべて消去しました。");
  }
}

// -------------------------------------------------------------
// モーダル ＆ ユーティリティ
// -------------------------------------------------------------

function showModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add("active");
}

function hideModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove("active");
}

function escapeHtml(str) {
  if (!str) return "";
  return str.toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// 初回体験用のデモデータを生成
function getDemoData() {
  return [
    {
      id: "P001",
      age: 78,
      gender: "男性",
      diagnosis: "脳梗塞（左片麻痺）",
      memo: "発症後3ヶ月。リハビリに対して非常に前向き。ROM、BBS、10m歩行、STEF、MAL、ARAT、BI、PASS、FIM、NIHSS、MMSE、BLS、SCP、SCIM、AIS、SARA、JOA股関節/膝/腰痛、整形外科テストを網羅測定。",
      records: [
        {
          date: "2026-06-01",
          evaluator: "A.B",
          evaluations: {
            bbs: {
              total: 32,
              q1: 3, q2: 2, q3: 4, q4: 2, q5: 3, q6: 2, q7: 2, q8: 2, q9: 2, q10: 2, q11: 2, q12: 2, q13: 2, q14: 2
            },
            rom: {
              shoulder_flex: { left: 120, right: 180 },
              shoulder_ext: { left: 35, right: 50 },
              shoulder_abd: { left: 110, right: 180 },
              elbow_flex: { left: 115, right: 145 },
              elbow_ext: { left: -10, right: 0 },
              wrist_flex: { left: 60, right: 90 },
              wrist_ext: { left: 40, right: 70 },
              hip_flex: { left: 95, right: 125 },
              hip_ext: { left: 5, right: 15 },
              knee_flex: { left: 95, right: 130 },
              knee_ext: { left: -5, right: 0 },
              ankle_flex: { left: 5, right: 20 },
              ankle_ext: { left: 25, right: 45 }
            },
            nasva: { total: 4, mobility: 0, feeding: 1, incontinence: 1, cognition: 1, comprehension: 1, speech: 0 },
            crs_r: { total: 3, auditory: 1, visual: 1, motor: 1, oromotor: 0, communication: 0, arousal: 0 },
            jcs: 10,
            gcs: { total: 12, eye: 3, verbal: 3, motor: 6 },
            j_chs: { total: 4, weight_loss: 1, muscle_weakness: 1, fatigue: 1, slowness: 1, low_activity: 0 },
            sppb: { total: 6, balance: 2, gait: 2, chair_stand: 2 },
            walk_10m: {
              time: 15.2,
              steps: 26,
              speed: 39.5,
              stride: 38.5
            },
            tug: {
              time: 18.5
            },
            stef: {
              left_total: 52,
              right_total: 100,
              t1: { time_left: 5.5, score_left: 6, time_right: 1.5, score_right: 10 },
              t2: { time_left: 6.2, score_left: 6, time_right: 1.6, score_right: 10 },
              t3: { time_left: 7.1, score_left: 5, time_right: 1.8, score_right: 10 },
              t4: { time_left: 7.8, score_left: 5, time_right: 2.0, score_right: 10 },
              t5: { time_left: 12.0, score_left: 5, time_right: 3.2, score_right: 10 },
              t6: { time_left: 8.5, score_left: 5, time_right: 2.1, score_right: 10 },
              t7: { time_left: 11.2, score_left: 5, time_right: 2.5, score_right: 10 },
              t8: { time_left: 10.8, score_left: 5, time_right: 2.3, score_right: 10 },
              t9: { time_left: 13.5, score_left: 5, time_right: 3.5, score_right: 10 },
              t10: { time_left: 16.0, score_left: 5, time_right: 4.2, score_right: 10 }
            },
            mal: {
              aou_mean: 1.21,
              qom_mean: 0.86,
              a1: { aou: 1, qom: 1 }, a2: { aou: 2, qom: 1 }, a3: { aou: 1, qom: 1 }, a4: { aou: 1, qom: 1 },
              a5: { aou: 2, qom: 1 }, a6: { aou: 1, qom: 1 }, a7: { aou: 1, qom: 1 }, a8: { aou: 1, qom: 1 },
              a9: { aou: 1, qom: 1 }, a10: { aou: 1, qom: 1 }, a11: { aou: 1, qom: 0 }, a12: { aou: 2, qom: 1 },
              a13: { aou: 1, qom: 1 }, a14: { aou: 1, qom: 0 }
            },
            arat: {
              total: 25,
              grasp_sub: 8, grip_sub: 5, pinch_sub: 6, gross_sub: 6,
              g1: 2, g2: 1, g3: 1, g4: 1, g5: 2, g6: 1,
              gr1: 2, gr2: 1, gr3: 1, gr4: 1,
              p1: 1, p2: 1, p3: 1, p4: 1, p5: 1, p6: 1,
              gm1: 2, gm2: 2, gm3: 2
            },
            bi: {
              total: 45,
              feeding: 5, bathing: 0, grooming: 0, dressing: 5, bowels: 5, bladder: 5, toilet: 5, transfer: 10, mobility: 10, stairs: 0
            },
            pass: {
              total: 12,
              posture_sup: 1, posture_sit: 1, posture_stand_unsupport: 0, posture_stand_on_para: 1, posture_stand_on_nonpara: 1,
              transfer_sup_to_para: 1, transfer_sup_to_nonpara: 1, transfer_sit_to_stand: 1, transfer_stand_to_sit: 1,
              transfer_sit_to_para: 1, transfer_sit_to_nonpara: 1, transfer_floor: 1
            },
            fim: {
              total: 58,
              motor_sub: 35,
              cognitive_sub: 23,
              m1: 3, m2: 2, m3: 3, m4: 2, m5: 2, m6: 2, m7: 3, m8: 3, m9: 3, m10: 3, m11: 3, m12: 3, m13: 3,
              c1: 5, c2: 4, c3: 5, c4: 4, c5: 5
            },
            nihss: {
              total: 10,
              q1a: 0, q1b: 1, q1c: 1, q2: 0, q3: 1, q4: 1, q5a: 2, q5b: 0, q6a: 2, q6b: 0, q7: 0, q8: 1, q9: 1, q10: 0, q11: 0
            },
            mmse: {
              total: 22,
              q1: 4, q2: 4, q3: 3, q4: 3, q5: 2, q6: 2, q7: 1, q8: 1, q9: 1, q10: 1
            },
            bls: {
              total: 7,
              q1: 2, q2: 2, q3: 1, q4: 1, q5: 1
            },
            scp: {
              total: 3.5,
              q1a: 0.75, q1b: 0.75, q2a: 0.5, q2b: 0.5, q3a: 0.5, q3b: 0.5
            },
            scim: {
              total: 35,
              self_care: 8, respiration_sphincter: 12, mobility: 15,
              q1_feeding: 1, q2_bathing_upper: 1, q3_bathing_lower: 1, q4_dressing_upper: 1, q5_dressing_lower: 1, q6_grooming: 1,
              q7_respiration: 4, q8_sphincter_urine: 3, q9_sphincter_bowel: 2, q10_toilet_use: 1,
              q11_mobility_bed: 2, q12_mobility_transfers: 1, q13_mobility_toilet: 1, q14_mobility_car: 0, q15_mobility_ground: 1, q16_mobility_ground_long: 0, q17_mobility_stairs: 0, q18_mobility_transfers_floor: 0
            },
            ais: {
              total: 32,
              motor_total: 32, uems: 20, lems: 12,
              level: "C5-C8", ais_class: "C",
              uems_c5: 4, uems_c6: 4, uems_c7: 4, uems_c8: 4, uems_t1: 4,
              lems_l2: 4, lems_l3: 4, lems_l4: 2, lems_l5: 2, lems_s1: 0
            },
            sara: {
              total: 24,
              gait: 5, stance: 4, sitting: 2, speech: 2,
              chase_left: 2, chase_right: 3, nose_left: 2, nose_right: 3,
              rotation_left: 3, rotation_right: 3, shin_left: 3, shin_right: 3
            },
            joa_hip: {
              total: 45, pain: 15, rom: 10, walking: 10, adl: 10
            },
            joa_knee: {
              total: 40, pain_walking: 10, stairs: 10, rom_limitation: 15, swelling: 5
            },
            joa_back: {
              total: 12, symptoms: 3, findings: 4, adl_back: 5
            },
            slr: 1,
            fnst: 0,
            kemp: 1,
            bragard: 1
          }
        },
        {
          date: "2026-06-15",
          evaluator: "A.B",
          evaluations: {
            bbs: {
              total: 40,
              q1: 4, q2: 3, q3: 4, q4: 3, q5: 3, q6: 3, q7: 3, q8: 3, q9: 2, q10: 3, q11: 3, q12: 2, q13: 2, q14: 2
            },
            rom: {
              shoulder_flex: { left: 140, right: 180 },
              shoulder_ext: { left: 40, right: 50 },
              shoulder_abd: { left: 135, right: 180 },
              elbow_flex: { left: 130, right: 145 },
              elbow_ext: { left: -5, right: 0 },
              wrist_flex: { left: 75, right: 90 },
              wrist_ext: { left: 55, right: 70 },
              hip_flex: { left: 110, right: 125 },
              hip_ext: { left: 10, right: 15 },
              knee_flex: { left: 110, right: 130 },
              knee_ext: { left: 0, right: 0 },
              ankle_flex: { left: 12, right: 20 },
              ankle_ext: { left: 35, right: 45 }
            },
            nasva: { total: 12, mobility: 1, feeding: 2, incontinence: 2, cognition: 2, comprehension: 3, speech: 2 },
            crs_r: { total: 10, auditory: 2, visual: 2, motor: 2, oromotor: 1, communication: 1, arousal: 2 },
            jcs: 2,
            gcs: { total: 14, eye: 4, verbal: 4, motor: 6 },
            j_chs: { total: 2, weight_loss: 0, muscle_weakness: 1, fatigue: 0, slowness: 1, low_activity: 0 },
            sppb: { total: 9, balance: 3, gait: 3, chair_stand: 3 },
            walk_10m: {
              time: 12.0,
              steps: 22,
              speed: 50.0,
              stride: 45.5
            },
            tug: {
              time: 15.2
            },
            stef: {
              left_total: 68,
              right_total: 100,
              t1: { time_left: 3.5, score_left: 8, time_right: 1.5, score_right: 10 },
              t2: { time_left: 4.1, score_left: 8, time_right: 1.6, score_right: 10 },
              t3: { time_left: 4.8, score_left: 7, time_right: 1.8, score_right: 10 },
              t4: { time_left: 5.2, score_left: 7, time_right: 2.0, score_right: 10 },
              t5: { time_left: 8.5, score_left: 6, time_right: 3.2, score_right: 10 },
              t6: { time_left: 6.1, score_left: 7, time_right: 2.1, score_right: 10 },
              t7: { time_left: 7.8, score_left: 6, time_right: 2.5, score_right: 10 },
              t8: { time_left: 8.0, score_left: 6, time_right: 2.3, score_right: 10 },
              t9: { time_left: 9.5, score_left: 6, time_right: 3.5, score_right: 10 },
              t10: { time_left: 11.2, score_left: 7, time_right: 4.2, score_right: 10 }
            },
            mal: {
              aou_mean: 2.21,
              qom_mean: 1.79,
              a1: { aou: 2, qom: 2 }, a2: { aou: 3, qom: 2 }, a3: { aou: 2, qom: 2 }, a4: { aou: 2, qom: 1 },
              a5: { aou: 3, qom: 2 }, a6: { aou: 2, qom: 2 }, a7: { aou: 2, qom: 2 }, a8: { aou: 2, qom: 1 },
              a9: { aou: 2, qom: 2 }, a10: { aou: 2, qom: 2 }, a11: { aou: 2, qom: 1 }, a12: { aou: 3, qom: 2 },
              a13: { aou: 2, qom: 2 }, a14: { aou: 2, qom: 1 }
            },
            arat: {
              total: 36,
              grasp_sub: 12, grip_sub: 8, pinch_sub: 9, gross_sub: 7,
              g1: 3, g2: 2, g3: 2, g4: 1, g5: 2, g6: 2,
              gr1: 3, gr2: 2, gr3: 2, gr4: 1,
              p1: 2, p2: 2, p3: 1, p4: 1, p5: 2, p6: 1,
              gm1: 3, gm2: 2, gm3: 2
            },
            bi: {
              total: 70,
              feeding: 10, bathing: 5, grooming: 5, dressing: 5, bowels: 10, bladder: 10, toilet: 5, transfer: 10, mobility: 10, stairs: 0
            },
            pass: {
              total: 22,
              posture_sup: 2, posture_sit: 2, posture_stand_unsupport: 1, posture_stand_on_para: 2, posture_stand_on_nonpara: 2,
              transfer_sup_to_para: 2, transfer_sup_to_nonpara: 2, transfer_sit_to_stand: 2, transfer_stand_to_sit: 2,
              transfer_sit_to_para: 2, transfer_sit_to_nonpara: 2, transfer_floor: 1
            },
            fim: {
              total: 80,
              motor_sub: 53,
              cognitive_sub: 27,
              m1: 5, m2: 4, m3: 4, m4: 4, m5: 4, m6: 3, m7: 4, m8: 4, m9: 4, m10: 4, m11: 4, m12: 5, m13: 4,
              c1: 6, c2: 5, c3: 6, c4: 5, c5: 5
            },
            nihss: {
              total: 5,
              q1a: 0, q1b: 0, q1c: 0, q2: 0, q3: 0, q4: 0, q5a: 1, q5b: 0, q6a: 1, q6b: 0, q7: 0, q8: 1, q9: 1, q10: 1, q11: 0
            },
            mmse: {
              total: 25,
              q1: 5, q2: 5, q3: 3, q4: 3, q5: 3, q6: 2, q7: 1, q8: 1, q9: 1, q10: 1
            },
            bls: {
              total: 3,
              q1: 1, q2: 1, q3: 1, q4: 0, q5: 0
            },
            scp: {
              total: 1.5,
              q1a: 0.25, q1b: 0.25, q2a: 0.25, q2b: 0.25, q3a: 0.25, q3b: 0.25
            },
            scim: {
              total: 58,
              self_care: 12, respiration_sphincter: 22, mobility: 24,
              q1_feeding: 2, q2_bathing_upper: 2, q3_bathing_lower: 2, q4_dressing_upper: 2, q5_dressing_lower: 2, q6_grooming: 2,
              q7_respiration: 6, q8_sphincter_urine: 6, q9_sphincter_bowel: 5, q10_toilet_use: 2,
              q11_mobility_bed: 4, q12_mobility_transfers: 1, q13_mobility_toilet: 1, q14_mobility_car: 1, q15_mobility_ground: 4, q16_mobility_ground_long: 3, q17_mobility_stairs: 1, q18_mobility_transfers_floor: 1
            },
            ais: {
              total: 55,
              motor_total: 55, uems: 35, lems: 20,
              level: "C5-C8", ais_class: "D",
              uems_c5: 8, uems_c6: 8, uems_c7: 6, uems_c8: 8, uems_t1: 5,
              lems_l2: 6, lems_l3: 6, lems_l4: 4, lems_l5: 4, lems_s1: 0
            },
            sara: {
              total: 14.5,
              gait: 3, stance: 2, sitting: 1, speech: 1,
              chase_left: 1, chase_right: 2, nose_left: 1, nose_right: 2,
              rotation_left: 2, rotation_right: 2, shin_left: 2, shin_right: 3
            },
            joa_hip: {
              total: 65, pain: 25, rom: 15, walking: 15, adl: 10
            },
            joa_knee: {
              total: 65, pain_walking: 20, stairs: 15, rom_limitation: 25, swelling: 5
            },
            joa_back: {
              total: 20, symptoms: 5, findings: 5, adl_back: 10
            },
            slr: 1,
            fnst: 0,
            kemp: 0,
            bragard: 0
          }
        },
        {
          date: "2026-07-12",
          evaluator: "A.B",
          evaluations: {
            bbs: {
              total: 48,
              q1: 4, q2: 4, q3: 4, q4: 4, q5: 4, q6: 4, q7: 4, q8: 3, q9: 3, q10: 3, q11: 3, q12: 3, q13: 3, q14: 2
            },
            rom: {
              shoulder_flex: { left: 160, right: 180 },
              shoulder_ext: { left: 45, right: 50 },
              shoulder_abd: { left: 160, right: 180 },
              elbow_flex: { left: 140, right: 145 },
              elbow_ext: { left: 0, right: 0 },
              wrist_flex: { left: 85, right: 90 },
              wrist_ext: { left: 65, right: 70 },
              hip_flex: { left: 120, right: 125 },
              hip_ext: { left: 15, right: 15 },
              knee_flex: { left: 120, right: 130 },
              knee_ext: { left: 0, right: 0 },
              ankle_flex: { left: 18, right: 20 },
              ankle_ext: { left: 40, right: 45 }
            },
            nasva: { total: 22, mobility: 3, feeding: 4, incontinence: 3, cognition: 4, comprehension: 4, speech: 4 },
            crs_r: { total: 19, auditory: 3, visual: 4, motor: 4, oromotor: 2, communication: 2, arousal: 3 },
            jcs: 0,
            gcs: { total: 15, eye: 4, verbal: 5, motor: 6 },
            j_chs: { total: 1, weight_loss: 0, muscle_weakness: 0, fatigue: 0, slowness: 1, low_activity: 0 },
            sppb: { total: 12, balance: 4, gait: 4, chair_stand: 4 },
            walk_10m: {
              time: 9.5,
              steps: 18,
              speed: 63.2,
              stride: 55.6
            },
            tug: {
              time: 11.8
            },
            stef: {
              left_total: 84,
              right_total: 100,
              t1: { time_left: 2.1, score_left: 10, time_right: 1.5, score_right: 10 },
              t2: { time_left: 2.5, score_left: 9, time_right: 1.6, score_right: 10 },
              t3: { time_left: 3.2, score_left: 8, time_right: 1.8, score_right: 10 },
              t4: { time_left: 3.8, score_left: 8, time_right: 2.0, score_right: 10 },
              t5: { time_left: 6.5, score_left: 8, time_right: 3.2, score_right: 10 },
              t6: { time_left: 4.2, score_left: 9, time_right: 2.1, score_right: 10 },
              t7: { time_left: 5.5, score_left: 8, time_right: 2.5, score_right: 10 },
              t8: { time_left: 5.8, score_left: 8, time_right: 2.3, score_right: 10 },
              t9: { time_left: 7.2, score_left: 8, time_right: 3.5, score_right: 10 },
              t10: { time_left: 9.0, score_left: 8, time_right: 4.2, score_right: 10 }
            },
            mal: {
              aou_mean: 3.57,
              qom_mean: 3.21,
              a1: { aou: 4, qom: 3 }, a2: { aou: 4, qom: 4 }, a3: { aou: 3, qom: 3 }, a4: { aou: 3, qom: 3 },
              a5: { aou: 4, qom: 3 }, a6: { aou: 3, qom: 3 }, a7: { aou: 3, qom: 3 }, a8: { aou: 3, qom: 3 },
              a9: { aou: 4, qom: 3 }, a10: { aou: 4, qom: 3 }, a11: { aou: 3, qom: 3 }, a12: { aou: 4, qom: 4 },
              a13: { aou: 4, qom: 4 }, a14: { aou: 4, qom: 3 }
            },
            arat: {
              total: 48,
              grasp_sub: 15, grip_sub: 10, pinch_sub: 14, gross_sub: 9,
              g1: 3, g2: 3, g3: 2, g4: 2, g5: 3, g6: 2,
              gr1: 3, gr2: 3, gr3: 2, gr4: 2,
              p1: 3, p2: 2, p3: 2, p4: 2, p5: 3, p6: 2,
              gm1: 3, gm2: 3, gm3: 3
            },
            bi: {
              total: 90,
              feeding: 10, bathing: 5, grooming: 5, dressing: 10, bowels: 10, bladder: 10, toilet: 10, transfer: 15, mobility: 15, stairs: 0
            },
            pass: {
              total: 32,
              posture_sup: 3, posture_sit: 3, posture_stand_unsupport: 3, posture_stand_on_para: 3, posture_stand_on_nonpara: 3,
              transfer_sup_to_para: 3, transfer_sup_to_nonpara: 3, transfer_sit_to_stand: 3, transfer_stand_to_sit: 3,
              transfer_sit_to_para: 3, transfer_sit_to_nonpara: 3, transfer_floor: 2
            },
            fim: {
              total: 105,
              motor_sub: 75,
              cognitive_sub: 30,
              m1: 6, m2: 6, m3: 6, m4: 6, m5: 6, m6: 5, m7: 6, m8: 6, m9: 6, m10: 5, m11: 5, m12: 6, m13: 6,
              c1: 6, c2: 6, c3: 6, c4: 6, c5: 6
            },
            nihss: {
              total: 1,
              q1a: 0, q1b: 0, q1c: 0, q2: 0, q3: 0, q4: 0, q5a: 0, q5b: 0, q6a: 0, q6b: 0, q7: 0, q8: 0, q9: 0, q10: 1, q11: 0
            },
            mmse: {
              total: 29,
              q1: 5, q2: 5, q3: 3, q4: 5, q5: 3, q6: 3, q7: 1, q8: 1, q9: 1, q10: 1
            },
            bls: {
              total: 0,
              q1: 0, q2: 0, q3: 0, q4: 0, q5: 0
            },
            scp: {
              total: 0.0,
              q1a: 0, q1b: 0, q2a: 0, q2b: 0, q3a: 0, q3b: 0
            },
            scim: {
              total: 85,
              self_care: 18, respiration_sphincter: 32, mobility: 35,
              q1_feeding: 3, q2_bathing_upper: 3, q3_bathing_lower: 3, q4_dressing_upper: 3, q5_dressing_lower: 3, q6_grooming: 3,
              q7_respiration: 10, q8_sphincter_urine: 12, q9_sphincter_bowel: 11, q10_toilet_use: 3,
              q11_mobility_bed: 6, q12_mobility_transfers: 2, q13_mobility_toilet: 2, q14_mobility_car: 2, q15_mobility_ground: 7, q16_mobility_ground_long: 7, q17_mobility_stairs: 3, q18_mobility_transfers_floor: 2
            },
            ais: {
              total: 84,
              motor_total: 84, uems: 46, lems: 38,
              level: "C5-C8", ais_class: "D",
              uems_c5: 10, uems_c6: 10, uems_c7: 8, uems_c8: 10, uems_t1: 8,
              lems_l2: 8, lems_l3: 8, lems_l4: 8, lems_l5: 8, lems_s1: 6
            },
            sara: {
              total: 4.5,
              gait: 1, stance: 1, sitting: 0, speech: 0,
              chase_left: 0, chase_right: 1, nose_left: 0, nose_right: 1,
              rotation_left: 1, rotation_right: 1, shin_left: 0, shin_right: 1
            },
            joa_shoulder: {
              total: 80, pain: 25, rom: 20, function: 15, support: 10, xray: 10
            },
            neer_test: { score: 0 },
            empty_can_test: { score: 0 },
            joa_hip: {
              total: 90, pain: 35, rom: 20, walking: 20, adl: 15
            },
            joa_knee: {
              total: 90, pain_walking: 30, stairs: 20, rom_limitation: 30, swelling: 10
            },
            joa_back: {
              total: 27, symptoms: 7, findings: 6, adl_back: 14
            },
            slr: 0,
            fnst: 0,
            kemp: 0,
            bragard: 0
          }
        }
      ]
    },
    {
      id: "P002",
      age: 65,
      gender: "女性",
      diagnosis: "右大腿骨頚部骨折",
      memo: "人工骨頭挿入術後。TUG、握力、膝伸展筋力、6分間歩行を測定。免荷終了し、現在全荷重歩行訓練中。",
      records: [
        {
          date: "2026-06-20",
          evaluator: "C.D",
          evaluations: {
            knee_extension: { left: 25.0, right: 12.0 },
            grip_strength: { left: 20.0, right: 18.0 },
            tug: { time: 22.4 },
            walk_6min: { distance: 180, borg_before: 9, borg_after: 15 }
          }
        },
        {
          date: "2026-07-10",
          evaluator: "C.D",
          evaluations: {
            knee_extension: { left: 26.5, right: 19.0 },
            grip_strength: { left: 21.0, right: 19.5 },
            tug: { time: 14.8 },
            walk_6min: { distance: 265, borg_before: 8, borg_after: 12 }
          }
        }
      ]
    }
  ];
}
