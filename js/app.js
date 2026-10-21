/**
 * ==============================================================================
 * PPCH Open House 2026 - Main Application Logic
 * โรงพยาบาลพิษณุเวช พิจิตร (Phitsanuvej Phichit Hospital - PRINC Group)
 * Database: Google Sheets (Spreadsheet ID: 1l6c1HyJ0hQaY7SK_DHkkdzEJ-33AClB0wW2tOCFCwLM)
 * Features:
 *   - Tactile 5-point rating buttons (Q1 - Q6)
 *   - Binary choice (Q7: อยาก / ไม่อยาก)
 *   - Optional feedback (Q8)
 *   - Real-time Presenter & Organizer Live Dashboard
 *   - Speed Dial FAB with 1s Auto-Collapse (Rule 3)
 *   - Direct 1-Click Link to Google Sheet
 *   - CSV Export with UTF-8 BOM (\uFEFF) (Rule 3)
 *   - Zero localStorage compliance (Rule 4)
 * ==============================================================================
 */

(function () {
  'use strict';

  // DOM Elements
  var form = document.getElementById('evaluationForm');
  var successCard = document.getElementById('successCard');
  var participantView = document.getElementById('participantFormView');
  var dashboardView = document.getElementById('dashboardView');
  var viewSwitchBtn = document.getElementById('viewSwitchBtn');
  var viewSwitchText = document.getElementById('viewSwitchText');
  var submitBtn = document.getElementById('submitBtn');
  var btnResetForm = document.getElementById('btnResetForm');
  var toast = document.getElementById('toast');
  var toastText = document.getElementById('toastText');

  // Dashboard DOM
  var kpiTotalResponses = document.getElementById('kpiTotalResponses');
  var kpiGrandAvg = document.getElementById('kpiGrandAvg');
  var kpiGrandPct = document.getElementById('kpiGrandPct');
  var kpiWantAgainPct = document.getElementById('kpiWantAgainPct');
  var refreshDataBtn = document.getElementById('refreshDataBtn');
  var feedbackListContainer = document.getElementById('feedbackListContainer');
  var feedbackCountBadge = document.getElementById('feedbackCountBadge');
  var feedbackSearchInput = document.getElementById('feedbackSearchInput');
  var wantFilterSelect = document.getElementById('wantFilterSelect');

  // Speed Dial DOM
  var speedDialContainer = document.getElementById('speedDialContainer');
  var speedDialBtn = document.getElementById('speedDialBtn');
  var speedDialTray = document.getElementById('speedDialTray');
  var btnOpenSheet = document.getElementById('btnOpenSheet');
  var btnExportCsv = document.getElementById('btnExportCsv');
  var btnPrintReport = document.getElementById('btnPrintReport');

  // State (Memory Only - STRICTLY ZERO localStorage)
  var currentView = 'form';
  var cachedRecords = [];
  var speedDialTimer = null;

  var RATING_LABELS = {
    '1': '1: น้อยที่สุด',
    '2': '2: น้อย',
    '3': '3: ปานกลาง',
    '4': '4: มาก',
    '5': '5: มากที่สุด'
  };

  function showToast(msg, duration) {
    if (!toast) return;
    toastText.textContent = msg;
    toast.style.display = 'inline-flex';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(function () {
      toast.style.display = 'none';
    }, duration || 3000);
  }

  function init() {
    setupRatingButtons();
    setupWantAgainToggle();
    setupFormSubmission();
    setupViewSwitching();
    setupDashboardControls();
    setupSpeedDial();

    var urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('view') === 'dashboard') {
      switchView('dashboard');
    }
  }

  /**
   * 1. ปุ่มให้คะแนน 1-5 แบบ Tactile พร้อมคำบรรยายระดับคะแนน
   */
  function setupRatingButtons() {
    var rows = document.querySelectorAll('.rating-buttons-row');

    rows.forEach(function (row) {
      var fieldName = row.getAttribute('data-field');
      var hiddenInput = document.getElementById('input_' + fieldName);
      var badge = document.getElementById('badge_' + fieldName);
      var card = document.getElementById('card_' + fieldName);
      var btns = row.querySelectorAll('.rating-btn');

      btns.forEach(function (btn) {
        btn.addEventListener('click', function () {
          var val = btn.getAttribute('data-val');

          btns.forEach(function (b) { b.classList.remove('active'); });
          btn.classList.add('active');

          if (hiddenInput) {
            hiddenInput.value = val;
          }

          if (badge) {
            badge.textContent = RATING_LABELS[val] || val;
            badge.style.opacity = '1';
          }

          if (card) {
            card.classList.remove('highlighted');
          }
        });
      });
    });
  }

  /**
   * 2. ปุ่มเลือกความต้องการให้จัดอีกหรือไม่ (อยาก / ไม่อยาก)
   */
  function setupWantAgainToggle() {
    var btnYes = document.getElementById('btnWantYes');
    var btnNo = document.getElementById('btnWantNo');
    var input = document.getElementById('input_want_again');

    if (!btnYes || !btnNo) return;

    btnYes.addEventListener('click', function () {
      btnYes.classList.add('selected-yes');
      btnNo.classList.remove('selected-no');
      btnYes.querySelector('.choice-icon').style.color = 'var(--ppch-emerald)';
      btnNo.querySelector('.choice-icon').style.color = 'var(--ppch-slate-400)';
      input.value = 'อยาก';
    });

    btnNo.addEventListener('click', function () {
      btnNo.classList.add('selected-no');
      btnYes.classList.remove('selected-yes');
      btnNo.querySelector('.choice-icon').style.color = 'var(--ppch-slate-600)';
      btnYes.querySelector('.choice-icon').style.color = 'var(--ppch-slate-400)';
      input.value = 'ไม่อยาก';
    });
  }

  /**
   * 3. การส่งแบบฟอร์มและการตรวจสอบความถูกต้อง
   */
  function setupFormSubmission() {
    if (!form) return;

    form.addEventListener('submit', async function (e) {
      e.preventDefault();

      var ratingFields = [
        { id: 'score_time', title: 'ข้อ 1. ความเหมาะสมของระยะเวลา' },
        { id: 'score_speakers', title: 'ข้อ 2. วิทยากร' },
        { id: 'score_knowledge', title: 'ข้อ 3. ความรู้ความเข้าใจ' },
        { id: 'score_career', title: 'ข้อ 4. การตัดสินใจสายอาชีพ' },
        { id: 'score_facilities', title: 'ข้อ 5. สิ่งอำนวยความสะดวก' },
        { id: 'score_food', title: 'ข้อ 6. อาหารและเครื่องดื่ม' }
      ];

      for (var i = 0; i < ratingFields.length; i++) {
        var field = ratingFields[i];
        var val = document.getElementById('input_' + field.id).value;
        if (!val) {
          var card = document.getElementById('card_' + field.id);
          if (card) {
            card.classList.add('highlighted');
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
          showToast('กรุณาให้คะแนน ' + field.title + ' ด้วยนะคะ', 3500);
          return;
        }
      }

      var formData = {
        score_time: document.getElementById('input_score_time').value,
        score_speakers: document.getElementById('input_score_speakers').value,
        score_knowledge: document.getElementById('input_score_knowledge').value,
        score_career: document.getElementById('input_score_career').value,
        score_facilities: document.getElementById('input_score_facilities').value,
        score_food: document.getElementById('input_score_food').value,
        want_again: document.getElementById('input_want_again').value,
        suggestions: document.getElementById('input_suggestions').value
      };

      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="material-icons-round" style="animation:spin 1s linear infinite;">refresh</span> <span>กำลังส่งแบบประเมิน...</span>';

      try {
        await window.PPCH_API.submitEvaluation(formData);
        
        form.style.display = 'none';
        successCard.style.display = 'block';
        window.scrollTo({ top: 0, behavior: 'smooth' });
        showToast('บันทึกผลเข้า Google Sheet เรียบร้อยแล้ว ขอบพระคุณค่ะ', 4000);

      } catch (err) {
        console.error('Submission failed:', err);
        alert('เกิดข้อผิดพลาดในการบันทึกข้อมูล:\n' + err.message);
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span class="material-icons-round">send</span> <span>ส่งแบบประเมินความพึงพอใจ</span>';
      }
    });

    if (btnResetForm) {
      btnResetForm.addEventListener('click', function () {
        form.reset();
        document.querySelectorAll('.rating-btn').forEach(function (b) { b.classList.remove('active'); });
        document.querySelectorAll('.scale-status-badge').forEach(function (b) { b.style.opacity = '0'; });
        document.querySelectorAll('input[type="hidden"]').forEach(function (i) {
          if (i.id !== 'input_want_again') i.value = '';
        });
        setupWantAgainToggle();
        successCard.style.display = 'none';
        form.style.display = 'block';
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
  }

  /**
   * 4. การสลับหน้าจอ (Form View <-> Dashboard View)
   */
  function setupViewSwitching() {
    if (!viewSwitchBtn) return;

    viewSwitchBtn.addEventListener('click', function () {
      if (currentView === 'form') {
        switchView('dashboard');
      } else {
        switchView('form');
      }
    });
  }

  function switchView(viewName) {
    currentView = viewName;
    var appRoot = document.getElementById('appRoot');

    if (viewName === 'dashboard') {
      participantView.style.display = 'none';
      dashboardView.style.display = 'block';
      viewSwitchText.textContent = 'ทำแบบประเมิน';
      viewSwitchBtn.classList.add('active');
      if (appRoot) appRoot.classList.add('widescreen-mode');
      loadDashboardData();
    } else {
      dashboardView.style.display = 'none';
      participantView.style.display = 'block';
      viewSwitchText.textContent = 'แดชบอร์ดสด';
      viewSwitchBtn.classList.remove('active');
      if (appRoot) appRoot.classList.remove('widescreen-mode');
    }
  }

  /**
   * 5. จัดการข้อมูล Dashboard & ฟิลเตอร์กรองข้อมูล
   */
  function setupDashboardControls() {
    if (refreshDataBtn) {
      refreshDataBtn.addEventListener('click', function () {
        loadDashboardData(true);
      });
    }

    if (feedbackSearchInput) {
      feedbackSearchInput.addEventListener('input', renderFilteredFeed);
    }
    if (wantFilterSelect) {
      wantFilterSelect.addEventListener('change', renderFilteredFeed);
    }
  }

  async function loadDashboardData(manualClick) {
    if (refreshDataBtn && manualClick) {
      refreshDataBtn.classList.add('active');
    }

    try {
      var metrics = await window.PPCH_API.fetchSummaryData();
      cachedRecords = metrics.records || [];

      kpiTotalResponses.textContent = metrics.total.toLocaleString();
      kpiGrandAvg.textContent = metrics.grandAvg.toFixed(2);
      kpiGrandPct.textContent = metrics.grandPct.toFixed(1);
      kpiWantAgainPct.textContent = metrics.wantAgainPct.toFixed(1);

      updateBar('time', metrics.dimensionAvgs.time);
      updateBar('speakers', metrics.dimensionAvgs.speakers);
      updateBar('knowledge', metrics.dimensionAvgs.knowledge);
      updateBar('career', metrics.dimensionAvgs.career);
      updateBar('facilities', metrics.dimensionAvgs.facilities);
      updateBar('food', metrics.dimensionAvgs.food);

      renderFilteredFeed();

      if (manualClick) {
        showToast('อัปเดตข้อมูลจาก Google Sheet เรียบร้อยแล้วค่ะ (' + metrics.total + ' รายการ)', 2500);
      }
    } catch (e) {
      console.warn('Dashboard load error:', e);
    } finally {
      if (refreshDataBtn && manualClick) {
        refreshDataBtn.classList.remove('active');
      }
    }
  }

  function updateBar(key, score) {
    var scoreElem = document.getElementById('score_dim_' + key);
    var barElem = document.getElementById('bar_dim_' + key);
    if (scoreElem) {
      scoreElem.textContent = score.toFixed(2) + ' / 5.00';
    }
    if (barElem) {
      var pct = Math.min(100, Math.max(0, (score / 5.0) * 100));
      barElem.style.width = pct + '%';
    }
  }

  function renderFilteredFeed() {
    if (!feedbackListContainer) return;

    var query = feedbackSearchInput ? feedbackSearchInput.value.toLowerCase().trim() : '';
    var wantFilter = wantFilterSelect ? wantFilterSelect.value : 'all';

    var filtered = cachedRecords.filter(function (r) {
      if (query) {
        var matchSuggest = (r.suggestions || '').toLowerCase().indexOf(query) !== -1;
        if (!matchSuggest) return false;
      }
      if (wantFilter !== 'all' && (r.want_again || 'อยาก') !== wantFilter) {
        return false;
      }
      return true;
    });

    feedbackCountBadge.textContent = filtered.length + ' รายการ';

    if (filtered.length === 0) {
      feedbackListContainer.innerHTML = '<div style="text-align:center; padding:24px; color:var(--ppch-slate-400); font-size:13px;">ไม่พบรายการที่ตรงกับเงื่อนไขการค้นหาค่ะ</div>';
      return;
    }

    var html = '';
    filtered.forEach(function (r) {
      var suggestText = r.suggestions && r.suggestions.trim() ? r.suggestions : '<em style="color:var(--ppch-slate-400); font-style:italic;">(ไม่มีข้อเสนอแนะเพิ่มเติม)</em>';
      var timeStr = r.created_at ? r.created_at : '';
      var wantBadge = r.want_again === 'อยาก' 
        ? '<span style="color:var(--ppch-emerald); font-weight:600;">✓ อยากให้จัดอีก</span>' 
        : '<span style="color:var(--ppch-slate-500);">✕ ไม่อยากให้จัด</span>';

      html += '<div class="feedback-bubble">' +
        '<div class="feedback-meta">' +
          '<span># ' + (r.id || '') + '</span>' +
          (timeStr ? '<span>• ' + timeStr + '</span>' : '') +
          '<span>• ' + wantBadge + '</span>' +
        '</div>' +
        '<div>' + suggestText + '</div>' +
      '</div>';
    });

    feedbackListContainer.innerHTML = html;
  }

  /**
   * 6. Speed Dial FAB Management (Rule 3)
   * Auto-collapses within 1 second after mouseleave
   */
  function setupSpeedDial() {
    if (!speedDialContainer || !speedDialBtn || !speedDialTray) return;

    function openTray() {
      clearTimeout(speedDialTimer);
      speedDialTray.classList.add('open');
    }

    function closeTray() {
      clearTimeout(speedDialTimer);
      speedDialTimer = setTimeout(function () {
        speedDialTray.classList.remove('open');
      }, 1000);
    }

    speedDialBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      speedDialTray.classList.toggle('open');
    });

    speedDialContainer.addEventListener('mouseenter', openTray);
    speedDialContainer.addEventListener('mouseleave', closeTray);

    // Open Google Sheet in new tab
    if (btnOpenSheet) {
      btnOpenSheet.addEventListener('click', function () {
        window.open(window.PPCH_API.getSheetUrl(), '_blank');
        closeTray();
      });
    }

    // Export CSV
    if (btnExportCsv) {
      btnExportCsv.addEventListener('click', function () {
        window.PPCH_API.exportToCsv(cachedRecords, 'PPCH_OpenHouse_2026_Evaluation_' + new Date().toISOString().slice(0, 10) + '.csv');
        closeTray();
      });
    }

    // Print A4 Report
    if (btnPrintReport) {
      btnPrintReport.addEventListener('click', function () {
        window.print();
        closeTray();
      });
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
