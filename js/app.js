/**
 * ==============================================================================
 * PPCH Open House 2026 - Participant Evaluation Form Logic
 * โรงพยาบาลพิษณุเวช พิจิตร (Phitsanuvej Phichit Hospital - PRINC Group)
 * Features:
 *   - Tactile 5-point rating buttons (Q1 - Q6)
 *   - Binary choice (Q7: อยาก / ไม่อยาก)
 *   - Optional feedback (Q8)
 *   - Full-Screen Logo Loading Overlay on Submission
 *   - Google Sheets Direct Submission
 *   - Zero localStorage compliance
 * ==============================================================================
 */

(function () {
  'use strict';

  // DOM Elements
  var form = document.getElementById('evaluationForm');
  var successCard = document.getElementById('successCard');
  var submitBtn = document.getElementById('submitBtn');
  var btnResetForm = document.getElementById('btnResetForm');
  var toast = document.getElementById('toast');
  var toastText = document.getElementById('toastText');
  var loadingOverlay = document.getElementById('loadingOverlay');

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

  function showLoading() {
    if (loadingOverlay) {
      loadingOverlay.style.display = 'flex';
      loadingOverlay.classList.add('active');
    }
  }

  function hideLoading() {
    if (loadingOverlay) {
      loadingOverlay.style.display = 'none';
      loadingOverlay.classList.remove('active');
    }
  }

  function init() {
    setupRatingButtons();
    setupWantAgainToggle();
    setupFormSubmission();
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
   * 3. การส่งแบบฟอร์มและการตรวจสอบความถูกต้อง พร้อม Logo Loading
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

      // 1. แสดง Logo Loading Screen ทันที
      showLoading();
      submitBtn.disabled = true;

      try {
        await window.PPCH_API.submitEvaluation(formData);
        
        // บันทึกสำเร็จ
        hideLoading();
        form.style.display = 'none';
        successCard.style.display = 'block';
        window.scrollTo({ top: 0, behavior: 'smooth' });
        showToast('บันทึกผลเข้า Google Sheet เรียบร้อยแล้ว ขอบพระคุณค่ะ', 4000);

      } catch (err) {
        console.error('Submission error:', err);
        hideLoading();
        alert('เกิดข้อผิดพลาดในการบันทึกข้อมูล:\n' + err.message);
      } finally {
        submitBtn.disabled = false;
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

  document.addEventListener('DOMContentLoaded', init);
})();
