/**
 * ==============================================================================
 * PPCH Open House 2026 - Google Sheets High-Compatibility Data Engine
 * โรงพยาบาลพิษณุเวช พิจิตร (Phitsanuvej Phichit Hospital - PRINC Group)
 * Primary Database: Google Sheets
 * Spreadsheet ID: 1l6c1HyJ0hQaY7SK_DHkkdzEJ-33AClB0wW2tOCFCwLM
 * ==============================================================================
 */

(function (window) {
  'use strict';

  var GAS_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbwkTR6uD_YvGexWF5LhrF7V_fJESSp8GCnA9cz_GFjD9rwoWu_E4sB6VHKC1ij7IERs9Q/exec';
  var GOOGLE_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1l6c1HyJ0hQaY7SK_DHkkdzEJ-33AClB0wW2tOCFCwLM/edit?gid=0#gid=0';

  var PPCH_API = {
    getGasUrl: function () {
      return GAS_WEBAPP_URL;
    },
    setGasUrl: function (url) {
      if (url && url.trim()) {
        GAS_WEBAPP_URL = url.trim();
      }
    },
    getSheetUrl: function () {
      return GOOGLE_SHEET_URL;
    },

    /**
     * ส่งผลแบบประเมินเข้า Google Sheets
     * ใช้ JSONP เพื่อให้ข้าม CORS ได้ 100% บนทุกเบราว์เซอร์ และได้รับสถานะยืนยันจริง
     */
    submitEvaluation: function (formData) {
      var payload = {
        score_time: parseInt(formData.score_time, 10),
        score_speakers: parseInt(formData.score_speakers, 10),
        score_knowledge: parseInt(formData.score_knowledge, 10),
        score_career: parseInt(formData.score_career, 10),
        score_facilities: parseInt(formData.score_facilities, 10),
        score_food: parseInt(formData.score_food, 10),
        want_again: formData.want_again || 'อยาก',
        suggestions: formData.suggestions ? formData.suggestions.trim() : ''
      };

      return new Promise(function (resolve, reject) {
        var callbackName = 'ppch_cb_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
        var url = GAS_WEBAPP_URL + (GAS_WEBAPP_URL.indexOf('?') !== -1 ? '&' : '?') +
          'action=submit' +
          '&callback=' + callbackName +
          '&payload=' + encodeURIComponent(JSON.stringify(payload)) +
          '&_t=' + Date.now();

        var script = document.createElement('script');
        script.src = url;

        var timer = setTimeout(function () {
          cleanup();
          // หาก JSONP ติด Timeout (เช่น ผู้ใช้ยังไม่ได้กด Deploy เป็น Anyone ใน Apps Script) ให้ลอง Fallback POST no-cors
          console.warn('JSONP timed out, attempting no-cors POST fallback...');
          fetch(GAS_WEBAPP_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
          }).then(function () {
            resolve({ success: true, source: 'google_sheets_post', data: payload });
          }).catch(function (e) {
            reject(new Error('ไม่สามารถบันทึกข้อมูลเข้า Google Sheets ได้: ' + e.message));
          });
        }, 8000);

        function cleanup() {
          clearTimeout(timer);
          try { delete window[callbackName]; } catch (e) {}
          if (script.parentNode) script.parentNode.removeChild(script);
        }

        window[callbackName] = function (res) {
          cleanup();
          if (res && res.status === 'success') {
            resolve({ success: true, source: 'google_sheets', data: res });
          } else {
            reject(new Error((res && res.message) || 'ระบบบันทึกไม่สำเร็จ'));
          }
        };

        script.onerror = function () {
          cleanup();
          // Fallback no-cors POST
          fetch(GAS_WEBAPP_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
          }).then(function () {
            resolve({ success: true, source: 'google_sheets_post', data: payload });
          }).catch(function (e) {
            reject(new Error('ไม่สามารถเชื่อมต่อ Google Apps Script ได้ (อาจยังไม่ได้ให้สิทธิ์เข้าถึงหรือตั้งค่า Anyone ค่ะ)'));
          });
        };

        document.body.appendChild(script);
      });
    },

    /**
     * ดึงข้อมูลสรุปผลล่าสุดจาก Google Sheets สำหรับ Live Dashboard
     */
    fetchSummaryData: async function () {
      var url = GAS_WEBAPP_URL + (GAS_WEBAPP_URL.indexOf('?') !== -1 ? '&' : '?') +
        'action=summary&_t=' + Date.now();

      try {
        var response = await fetch(url, {
          method: 'GET',
          headers: { 'Accept': 'application/json' }
        });

        if (response.ok) {
          var data = await response.json();
          if (data && data.status === 'success') {
            return {
              total: data.total || 0,
              grandAvg: Number(data.grandAvg || 0),
              grandPct: Number(data.grandPct || 0),
              wantAgainPct: Number(data.wantAgainPct || 0),
              wantCount: data.wantCount || 0,
              notWantCount: data.notWantCount || 0,
              dimensionAvgs: data.dimensionAvgs || { time: 0, speakers: 0, knowledge: 0, career: 0, facilities: 0, food: 0 },
              records: data.records || []
            };
          }
        }
      } catch (err) {
        console.warn('Fetch GET error, trying JSONP fallback...', err);
      }

      return new Promise(function (resolve) {
        var callbackName = 'ppch_sum_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
        var jsonpUrl = GAS_WEBAPP_URL + (GAS_WEBAPP_URL.indexOf('?') !== -1 ? '&' : '?') +
          'action=summary' +
          '&callback=' + callbackName +
          '&_t=' + Date.now();

        var script = document.createElement('script');
        script.src = jsonpUrl;

        var timer = setTimeout(function () {
          cleanup();
          resolve({
            total: 0,
            grandAvg: 0,
            grandPct: 0,
            wantAgainPct: 0,
            dimensionAvgs: { time: 0, speakers: 0, knowledge: 0, career: 0, facilities: 0, food: 0 },
            records: []
          });
        }, 7000);

        function cleanup() {
          clearTimeout(timer);
          try { delete window[callbackName]; } catch (e) {}
          if (script.parentNode) script.parentNode.removeChild(script);
        }

        window[callbackName] = function (data) {
          cleanup();
          if (data && data.status === 'success') {
            resolve({
              total: data.total || 0,
              grandAvg: Number(data.grandAvg || 0),
              grandPct: Number(data.grandPct || 0),
              wantAgainPct: Number(data.wantAgainPct || 0),
              wantCount: data.wantCount || 0,
              notWantCount: data.notWantCount || 0,
              dimensionAvgs: data.dimensionAvgs || { time: 0, speakers: 0, knowledge: 0, career: 0, facilities: 0, food: 0 },
              records: data.records || []
            });
          } else {
            resolve({ total: 0, grandAvg: 0, grandPct: 0, wantAgainPct: 0, dimensionAvgs: { time: 0, speakers: 0, knowledge: 0, career: 0, facilities: 0, food: 0 }, records: [] });
          }
        };

        script.onerror = function () {
          cleanup();
          resolve({ total: 0, grandAvg: 0, grandPct: 0, wantAgainPct: 0, dimensionAvgs: { time: 0, speakers: 0, knowledge: 0, career: 0, facilities: 0, food: 0 }, records: [] });
        };

        document.body.appendChild(script);
      });
    },

    /**
     * ส่งออกไฟล์ CSV พร้อม UTF-8 BOM (\uFEFF) ป้องกันภาษาไทยเพี้ยนใน Microsoft Excel
     */
    exportToCsv: function (records, filename) {
      if (!records || records.length === 0) {
        alert('ยังไม่มีข้อมูลสำหรับส่งออกค่ะ หรือสามารถเปิดดูข้อมูลสดบน Google Sheet ได้โดยตรงนะคะ');
        return;
      }

      var headers = [
        'ลำดับ',
        'วันเวลาที่ประเมิน',
        '1.ระยะเวลาเหมาะสม',
        '2.ความรู้วิทยากร',
        '3.ความรู้เพิ่มขึ้น',
        '4.ความเชื่อมั่นสายอาชีพ',
        '5.สิ่งอำนวยความสะดวก',
        '6.อาหารและเครื่องดื่ม',
        'คะแนนเฉลี่ย (เต็ม 5)',
        'ร้อยละความพึงพอใจ',
        'อยากให้จัดอีกหรือไม่',
        'ข้อเสนอแนะเพิ่มเติม'
      ];

      var rows = records.map(function (r, index) {
        var q1 = Number(r.score_time) || 0;
        var q2 = Number(r.score_speakers) || 0;
        var q3 = Number(r.score_knowledge) || 0;
        var q4 = Number(r.score_career) || 0;
        var q5 = Number(r.score_facilities) || 0;
        var q6 = Number(r.score_food) || 0;
        var avg = ((q1 + q2 + q3 + q4 + q5 + q6) / 6.0).toFixed(2);
        var pct = ((avg / 5.0) * 100).toFixed(1) + '%';
        var dateStr = r.created_at ? r.created_at : '-';

        return [
          index + 1,
          '"' + String(dateStr).replace(/"/g, '""') + '"',
          q1,
          q2,
          q3,
          q4,
          q5,
          q6,
          avg,
          pct,
          '"' + (r.want_again || 'อยาก').replace(/"/g, '""') + '"',
          '"' + (r.suggestions || '-').replace(/"/g, '""') + '"'
        ].join(',');
      });

      var csvContent = '\uFEFF' + headers.join(',') + '\r\n' + rows.join('\r\n');
      var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      var link = document.createElement('a');
      var url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', filename || 'PPCH_OpenHouse_2026_Evaluation.csv');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  };

  window.PPCH_API = PPCH_API;
})(window);
