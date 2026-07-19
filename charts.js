/**
 * charts.js
 * Chart.js を使用してリハビリ評価データの時系列グラフを描画するモジュール
 */

let activeChart = null;

/**
 * グラフを描画・更新する
 * @param {string} canvasId 描画対象のキャンバス要素ID
 * @param {Array} records 患者の評価履歴データ
 * @param {string} evalId 評価項目ID (例: 'bbs', 'rom')
 * @param {string} subItemId 下位項目ID (例: 'total', 'q1', 'left', 'shoulder_flex')
 */
function updateChart(canvasId, records, evalId, subItemId = "total") {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  // 特定の合計点がない項目に対するサブ項目のフォールバック
  let activeSubItemId = subItemId;
  if (evalId === "basic_info" && activeSubItemId === "total") activeSubItemId = "bmi";
  else if (evalId === "frt" && activeSubItemId === "total") activeSubItemId = "reach";
  else if (evalId === "ss5" && activeSubItemId === "total") activeSubItemId = "time";
  else if (evalId === "cs30" && activeSubItemId === "total") activeSubItemId = "count";

  // 既存のチャートを破棄
  if (activeChart) {
    activeChart.destroy();
    activeChart = null;
  }

  // 履歴データを日付の昇順（古い順）にソート
  const sortedRecords = [...records].sort((a, b) => new Date(a.date) - new Date(b.date));

  // 指定された評価データが含まれるレコードのみを抽出
  const chartDataPoints = [];
  
  sortedRecords.forEach(record => {
    if (record.evaluations && record.evaluations[evalId]) {
      chartDataPoints.push({
        date: formatDateString(record.date),
        data: record.evaluations[evalId]
      });
    }
  });

  if (chartDataPoints.length === 0) {
    // データがない場合は空のグラフを表示するか、またはメッセージを表示する
    showNoChartDataMessage(canvasId);
    return;
  }

  const labels = chartDataPoints.map(p => p.date);
  let datasets = [];

  const evalMeta = PRESET_EVALUATIONS[evalId] || getCustomEvalMeta(evalId);
  const evalName = evalMeta ? evalMeta.name : evalId;

  // 1. ROM（関節可動域）または Bilateral_numeric（膝伸展筋力・握力）の場合（左右別描画）
  if (evalMeta && (evalMeta.inputType === "rom" || evalMeta.inputType === "bilateral_numeric" || evalMeta.inputType === "knee_wbi_calc" || evalMeta.inputType === "mmt_custom" || (evalMeta.inputType === "mrc_custom" && activeSubItemId !== "total"))) {
    let subItemKey = activeSubItemId;
    
    // ROMで subItemId が total 等で初期化されている場合は、デフォルトで最初のサブ項目を設定
    if (evalMeta.inputType === "rom" && (activeSubItemId === "total" || !subItemsExist(evalMeta, activeSubItemId))) {
      subItemKey = Object.keys(evalMeta.subItems)[0]; // デフォルトは肩関節屈曲
    }

    const itemLabel = evalMeta.subItems[subItemKey] ? evalMeta.subItems[subItemKey].name : subItemKey;
    const unit = evalMeta.subItems[subItemKey] ? evalMeta.subItems[subItemKey].unit : "";

    // 左右のデータをそれぞれ抽出
    const leftData = [];
    const rightData = [];

    chartDataPoints.forEach(p => {
      const val = p.data[subItemKey];
      if (val && typeof val === "object") {
        leftData.push(val.left !== undefined ? Number(val.left) : null);
        rightData.push(val.right !== undefined ? Number(val.right) : null);
      } else {
        // bilateral_numeric の場合、subItemKey がそのまま 'left' または 'right' になる場合がある
        if (subItemKey === "left" || subItemKey === "right") {
          // 片方のみのプロットにする
          if (subItemKey === "left") leftData.push(p.data.left !== undefined ? Number(p.data.left) : null);
          if (subItemKey === "right") rightData.push(p.data.right !== undefined ? Number(p.data.right) : null);
        } else {
          // 通常は bilateral_numeric は 'left' と 'right' がサブ項目として存在する
          leftData.push(p.data.left !== undefined ? Number(p.data.left) : null);
          rightData.push(p.data.right !== undefined ? Number(p.data.right) : null);
        }
      }
    });

    if (subItemKey !== "left" && subItemKey !== "right") {
      datasets.push({
        label: `左 - ${itemLabel}`,
        data: leftData,
        borderColor: "#0ea5e9", // アプリテーマ青
        backgroundColor: "rgba(14, 165, 233, 0.1)",
        borderWidth: 3,
        tension: 0.15,
        spanGaps: true,
        pointBackgroundColor: "#0ea5e9",
        pointRadius: 5
      });
      datasets.push({
        label: `右 - ${itemLabel}`,
        data: rightData,
        borderColor: "#a855f7", // パープル
        backgroundColor: "rgba(168, 85, 247, 0.1)",
        borderWidth: 3,
        tension: 0.15,
        spanGaps: true,
        pointBackgroundColor: "#a855f7",
        pointRadius: 5
      });
    } else {
      // 片側のみ選択された場合
      const isLeft = subItemKey === "left";
      datasets.push({
        label: isLeft ? `左 - ${evalName}` : `右 - ${evalName}`,
        data: isLeft ? leftData : rightData,
        borderColor: isLeft ? "#0ea5e9" : "#a855f7",
        backgroundColor: isLeft ? "rgba(14, 165, 233, 0.1)" : "rgba(168, 85, 247, 0.1)",
        borderWidth: 3,
        tension: 0.15,
        spanGaps: true,
        pointRadius: 5
      });
    }

  } 
  // 2. 10m歩行テストの場合
  else if (evalId === "walk_10m") {
    let subItemKey = activeSubItemId;
    if (activeSubItemId === "total" || activeSubItemId === "speed") {
      subItemKey = "speed"; // デフォルトは歩行速度
    }

    const unit = evalMeta.subItems[subItemKey] ? evalMeta.subItems[subItemKey].unit : "";
    const itemLabel = evalMeta.subItems[subItemKey] ? evalMeta.subItems[subItemKey].name : subItemKey;
    const dataVals = chartDataPoints.map(p => p.data[subItemKey] !== undefined ? Number(p.data[subItemKey]) : null);

    datasets.push({
      label: `${evalName} (${itemLabel})`,
      data: dataVals,
      borderColor: "#10b981", // グリーン
      backgroundColor: "rgba(16, 185, 129, 0.1)",
      borderWidth: 3,
      tension: 0.15,
      spanGaps: true,
      pointBackgroundColor: "#10b981",
      pointRadius: 5
    });
  }
  // 3. Brunsnstrom Stage の場合 (I〜VI を 1〜6 にマッピング)
  else if (evalId === "brs") {
    let subItemKey = activeSubItemId;
    if (activeSubItemId === "total") {
      subItemKey = "arm"; // デフォルトは上肢
    }

    const itemLabel = evalMeta.subItems[subItemKey] ? evalMeta.subItems[subItemKey].name : subItemKey;
    const stageMap = { "I": 1, "II": 2, "III": 3, "IV": 4, "V": 5, "VI": 6 };
    const dataVals = chartDataPoints.map(p => {
      const stageStr = p.data[subItemKey];
      return stageStr ? stageMap[stageStr] || null : null;
    });

    datasets.push({
      label: `${evalName} (${itemLabel})`,
      data: dataVals,
      borderColor: "#8b5cf6", // パープル
      backgroundColor: "rgba(139, 92, 246, 0.1)",
      borderWidth: 3,
      tension: 0.1,
      spanGaps: true,
      pointRadius: 6,
      pointBackgroundColor: "#8b5cf6"
    });
  }
  // 4. MAS（Modified Ashworth Scale）の場合 (0, 1, 1+, 2, 3, 4 -> 0, 1, 1.5, 2, 3, 4 に変換)
  else if (evalId === "mas") {
    const dataVals = chartDataPoints.map(p => {
      const masVal = p.data.score;
      if (masVal === "1+") return 1.5;
      return masVal !== undefined ? Number(masVal) : null;
    });

    const muscleLabel = chartDataPoints[chartDataPoints.length - 1].data.target_muscle || "対象筋";

    datasets.push({
      label: `${evalName} (${muscleLabel})`,
      data: dataVals,
      borderColor: "#f43f5e", // ローズ
      backgroundColor: "rgba(244, 63, 94, 0.1)",
      borderWidth: 3,
      tension: 0.1,
      spanGaps: true,
      pointRadius: 5,
      pointBackgroundColor: "#f43f5e"
    });
  }
  // 5. 6分間歩行テストの場合
  else if (evalId === "walk_6min") {
    let subItemKey = activeSubItemId === "total" ? "distance" : activeSubItemId;
    const itemLabel = evalMeta.subItems[subItemKey] ? evalMeta.subItems[subItemKey].name : subItemKey;
    const dataVals = chartDataPoints.map(p => p.data[subItemKey] !== undefined ? Number(p.data[subItemKey]) : null);

    datasets.push({
      label: `${evalName} (${itemLabel})`,
      data: dataVals,
      borderColor: "#0ea5e9",
      backgroundColor: "rgba(14, 165, 233, 0.1)",
      borderWidth: 3,
      tension: 0.15,
      spanGaps: true,
      pointRadius: 5
    });
  }
  // 5-2. STEF の場合
  else if (evalId === "stef") {
    const isTotal = activeSubItemId === "total" || activeSubItemId === "left_total" || activeSubItemId === "right_total" || !activeSubItemId;
    const leftData = [];
    const rightData = [];

    chartDataPoints.forEach(p => {
      if (isTotal) {
        leftData.push(p.data.left_total !== undefined ? Number(p.data.left_total) : null);
        rightData.push(p.data.right_total !== undefined ? Number(p.data.right_total) : null);
      } else {
        const itemVal = p.data[activeSubItemId];
        if (itemVal) {
          leftData.push(itemVal.time_left !== undefined ? Number(itemVal.time_left) : null);
          rightData.push(itemVal.time_right !== undefined ? Number(itemVal.time_right) : null);
        } else {
          leftData.push(null);
          rightData.push(null);
        }
      }
    });

    const itemLabel = isTotal ? "合計点" : (evalMeta.subItems[activeSubItemId] ? evalMeta.subItems[activeSubItemId].name : activeSubItemId);
    const unit = isTotal ? "点" : "秒";

    datasets.push({
      label: `左 - ${itemLabel} (${unit})`,
      data: leftData,
      borderColor: "#0ea5e9",
      backgroundColor: "rgba(14, 165, 233, 0.1)",
      borderWidth: 3,
      tension: 0.15,
      spanGaps: true,
      pointRadius: 5
    });

    datasets.push({
      label: `右 - ${itemLabel} (${unit})`,
      data: rightData,
      borderColor: "#a855f7",
      backgroundColor: "rgba(168, 85, 247, 0.1)",
      borderWidth: 3,
      tension: 0.15,
      spanGaps: true,
      pointRadius: 5
    });
  }
  // 5-3. MAL の場合
  else if (evalId === "mal") {
    const isTotal = activeSubItemId === "total" || activeSubItemId === "aou_mean" || activeSubItemId === "qom_mean" || !activeSubItemId;
    const aouData = [];
    const qomData = [];

    chartDataPoints.forEach(p => {
      if (isTotal) {
        aouData.push(p.data.aou_mean !== undefined ? Number(p.data.aou_mean) : null);
        qomData.push(p.data.qom_mean !== undefined ? Number(p.data.qom_mean) : null);
      } else {
        const itemVal = p.data[activeSubItemId];
        if (itemVal) {
          aouData.push(itemVal.aou !== undefined ? Number(itemVal.aou) : null);
          qomData.push(itemVal.qom !== undefined ? Number(itemVal.qom) : null);
        } else {
          aouData.push(null);
          qomData.push(null);
        }
      }
    });

    const itemLabel = isTotal ? "平均値" : (evalMeta.actions.find(a => a.id === activeSubItemId)?.name || activeSubItemId);

    datasets.push({
      label: `AOU (使用頻度) - ${itemLabel}`,
      data: aouData,
      borderColor: "#0ea5e9",
      backgroundColor: "rgba(14, 165, 233, 0.1)",
      borderWidth: 3,
      tension: 0.15,
      spanGaps: true,
      pointRadius: 5
    });

    datasets.push({
      label: `QOM (動作の質) - ${itemLabel}`,
      data: qomData,
      borderColor: "#10b981",
      backgroundColor: "rgba(16, 185, 129, 0.1)",
      borderWidth: 3,
      tension: 0.15,
      spanGaps: true,
      pointRadius: 5
    });
  }
  // 6. 一般的な多項目評価（BBS, FMA, SIAS, SCP, TIS, TCT など）
  else {
    const isTotal = activeSubItemId === "total" || !activeSubItemId;
    const dataVals = [];

    chartDataPoints.forEach(p => {
      if (isTotal) {
        dataVals.push(p.data.total !== undefined ? Number(p.data.total) : null);
      } else {
        dataVals.push(p.data[activeSubItemId] !== undefined ? Number(p.data[activeSubItemId]) : null);
      }
    });

    const itemLabel = isTotal ? "合計点" : (evalMeta.subItems[activeSubItemId] ? evalMeta.subItems[activeSubItemId].name : activeSubItemId);
    const unit = isTotal ? "点" : "点";

    datasets.push({
      label: `${evalName} (${itemLabel})`,
      data: dataVals,
      borderColor: isTotal ? "#0ea5e9" : "#10b981",
      backgroundColor: isTotal ? "rgba(14, 165, 233, 0.1)" : "rgba(16, 185, 129, 0.1)",
      borderWidth: 3,
      tension: 0.15,
      spanGaps: true,
      pointRadius: 5
    });
  }

  // グラフオプションの設定
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: "top",
        labels: {
          color: "#0f172a",
          font: { family: "Inter", size: 12 }
        }
      },
      tooltip: {
        mode: "index",
        intersect: false,
        backgroundColor: "#ffffff",
        titleColor: "#0f172a",
        bodyColor: "#0f172a",
        borderColor: "rgba(15, 23, 42, 0.1)",
        borderWidth: 1,
        callbacks: {
          label: function(context) {
            let label = context.dataset.label || "";
            if (label) label += ": ";
            if (context.parsed.y !== null) {
              // BRSの縦軸ラベルマッピング
              if (evalId === "brs") {
                const stageMapReverse = { 1: "Stage I", 2: "Stage II", 3: "Stage III", 4: "Stage IV", 5: "Stage V", 6: "Stage VI" };
                label += stageMapReverse[context.parsed.y] || context.parsed.y;
              } else if (evalId === "mas") {
                // MASのマッピング戻し
                if (context.parsed.y === 1.5) label += "1+";
                else label += context.parsed.y;
              } else {
                label += context.parsed.y;
                // 単位を追加
                const unit = getUnitForEvaluation(evalId, activeSubItemId);
                if (unit) label += ` ${unit}`;
              }
            }
            return label;
          }
        }
      }
    },
    scales: {
      x: {
        grid: { color: "rgba(15, 23, 42, 0.05)" },
        ticks: { color: "#475569", font: { family: "Inter" } }
      },
      y: {
        grid: { color: "rgba(15, 23, 42, 0.05)" },
        ticks: {
          color: "#475569",
          font: { family: "Inter" },
          // BRSの場合はY軸をStage名にする
          callback: function(value) {
            if (evalId === "brs") {
              const stages = ["", "I", "II", "III", "IV", "V", "VI"];
              return stages[value] || "";
            }
            if (evalId === "mas") {
              if (value === 1.5) return "1+";
              return value;
            }
            return value;
          }
        }
      }
    }
  };

  // Y軸の範囲調整
  if (evalId === "brs") {
    options.scales.y.min = 1;
    options.scales.y.max = 6;
    options.scales.y.ticks.stepSize = 1;
  } else if (evalId === "mas") {
    options.scales.y.min = 0;
    options.scales.y.max = 4;
  } else if (evalMeta && evalMeta.inputType === "single_select" && evalId === "fac") {
    options.scales.y.min = 0;
    options.scales.y.max = 5;
    options.scales.y.ticks.stepSize = 1;
  }

  // 新しいチャートを作成
  activeChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: datasets
    },
    options: options
  });
}

/**
 * 補助関数: 日付文字列のフォーマット (例: 2026-07-12 -> 7/12)
 */
function formatDateString(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/**
 * 補助関数: 指定した下位項目が定義に含まれるかチェック
 */
function subItemsExist(evalMeta, activeSubItemId) {
  return evalMeta && evalMeta.subItems && evalMeta.subItems[subItemId] !== undefined;
}

/**
 * 補助関数: カスタム評価項目の定義をローカルストレージなどから取得するフォールバック
 */
function getCustomEvalMeta(evalId) {
  try {
    const customEvals = JSON.parse(localStorage.getItem("rehareco_custom_evaluations") || "[]");
    return customEvals.find(e => e.id === evalId);
  } catch (e) {
    return null;
  }
}

/**
 * 補助関数: 単位の取得
 */
function getUnitForEvaluation(evalId, subItemId) {
  const preset = PRESET_EVALUATIONS[evalId];
  if (preset) {
    if (preset.subItems && preset.subItems[subItemId] && preset.subItems[subItemId].unit !== undefined) {
      return preset.subItems[subItemId].unit;
    }
    return preset.unit || "";
  }
  const custom = getCustomEvalMeta(evalId);
  return custom ? custom.unit || "" : "";
}

/**
 * データなしのメッセージを表示する
 */
function showNoChartDataMessage(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const parent = canvas.parentElement;
  
  // 既存のメッセージを削除
  const oldMsg = parent.querySelector(".no-chart-data-msg");
  if (oldMsg) oldMsg.remove();
  
  const msg = document.createElement("div");
  msg.className = "no-chart-data-msg no-data";
  msg.textContent = "この評価項目の記録データがありません。";
  parent.appendChild(msg);
  
  canvas.style.display = "none";
}

/**
 * 描画エリアの初期化
 */
function resetChartView(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  canvas.style.display = "block";
  const parent = canvas.parentElement;
  const oldMsg = parent.querySelector(".no-chart-data-msg");
  if (oldMsg) oldMsg.remove();
}
