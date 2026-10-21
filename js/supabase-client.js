/**
 * ==============================================================================
 * PPCH Open House 2026 - Supabase & Data Engine
 * โรงพยาบาลพิษณุเวช พิจิตร (Phitsanuvej Phichit Hospital - PRINC Group)
 * STRICT RULES: 
 *   - Primary DB: Supabase PostgreSQL (Sub-100ms, Concurrency-Safe)
 *   - Backup: Google Sheets via GAS Webhook
 *   - ZERO localStorage for system data
 *   - UTF-8 BOM for CSV/Excel export
 * ==============================================================================
 */

(function (window) {
  'use strict';

  var SUPABASE_CONFIG = {
    url: 'https://jauxlzjmhtnncrwrloyr.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImphdXhsemptaHRubmNyd3Jsb3lyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0NDUxMDksImV4cCI6MjEwNzAyMTEwOX0.IFKN8_nv0U_UKNgeP4A-gcZ3u_EjDQhhvcyyW9P-Yw0',
    tableName: 'ppch_openhouse_evaluations'
  };

  // Optional GAS Webhook URL (สามารถกำหนดได้จาก Admin Dashboard หรือ Config)
  var DEFAULT_GAS_URL = '';

  var PPCH_API = {
    getConfig: function () {
      return SUPABASE_CONFIG;
    },

    /**
     * ส่งผลแบบประเมินเข้า Supabase PostgreSQL (High Concurrency / Sub-100ms)
     * รองรับการกดส่งพร้อมกันได้หลายร้อยคนโดยไม่ชนกัน
     */
    submitEvaluation: async function (formData) {
      var payload = {
        event_name: 'PPCH Open House 2026',
        event_date: '2026-10-22',
        attendee_type: formData.attendee_type || 'นักเรียน',
        school_name: formData.school_name ? formData.school_name.trim() : '',
        score_time: parseInt(formData.score_time, 10),
        score_speakers: parseInt(formData.score_speakers, 10),
        score_knowledge: parseInt(formData.score_knowledge, 10),
        score_career: parseInt(formData.score_career, 10),
        score_facilities: parseInt(formData.score_facilities, 10),
        score_food: parseInt(formData.score_food, 10),
        want_again: formData.want_again || 'อยาก',
        suggestions: formData.suggestions ? formData.suggestions.trim() : '',
        created_at: new Date().toISOString()
      };

      // 1. ส่งเข้า Supabase เป็น Primary Database
      var endpoint = SUPABASE_CONFIG.url + '/rest/v1/' + SUPABASE_CONFIG.tableName;
      try {
        var response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_CONFIG.anonKey,
            'Authorization': 'Bearer ' + SUPABASE_CONFIG.anonKey,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
          },
          body: JSON.stringify(payload)
        });

        if (response.ok) {
          var resData = await response.json();
          var insertedRecord = Array.isArray(resData) && resData.length > 0 ? resData[0] : payload;

          // ถ้ามี GAS Webhook ให้ Background Mirror ไปยัง Google Sheets ทันที
          if (DEFAULT_GAS_URL) {
            PPCH_API.mirrorToSheet(insertedRecord, DEFAULT_GAS_URL);
          }

          return {
            success: true,
            source: 'supabase',
            data: insertedRecord
          };
        } else {
          var errText = await response.text();
          console.warn('Supabase submission response status:', response.status, errText);

          // ถ้าตารางยังไม่ได้รัน SQL หรือเกิดข้อผิดพลาด ให้ลองส่งเข้า GAS Webhook เป็น Fallback
          if (DEFAULT_GAS_URL) {
            return await PPCH_API.submitToGas(payload, DEFAULT_GAS_URL);
          }

          throw new Error('Supabase (' + response.status + '): ' + errText);
        }
      } catch (err) {
        console.error('Submit error:', err);
        // Fallback ไปยัง GAS ถ้ามี URL
        if (DEFAULT_GAS_URL) {
          return await PPCH_API.submitToGas(payload, DEFAULT_GAS_URL);
        }
        throw err;
      }
    },

    /**
     * ดึงข้อมูลสรุปสถิติทั้งหมดจาก Supabase สำหรับแดชบอร์ด
     */
    fetchSummaryData: async function () {
      var endpoint = SUPABASE_CONFIG.url + '/rest/v1/' + SUPABASE_CONFIG.tableName + '?select=*&order=created_at.desc';
      try {
        var response = await fetch(endpoint, {
          method: 'GET',
          headers: {
            'apikey': SUPABASE_CONFIG.anonKey,
            'Authorization': 'Bearer ' + SUPABASE_CONFIG.anonKey,
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          var errText = await response.text();
          throw new Error('Supabase error (' + response.status + '): ' + errText);
        }

        var records = await response.json();
        return PPCH_API.computeMetrics(records);
      } catch (err) {
        console.warn('Could not fetch from Supabase:', err);
        return {
          total: 0,
          records: [],
          error: err.message
        };
      }
    },

    /**
     * คำนวณค่าสถิติจากชุดข้อมูลดิบ
     */
    computeMetrics: function (records) {
      var total = records.length;
      if (total === 0) {
        return {
          total: 0,
          grandAvg: 0,
          grandPct: 0,
          wantAgainPct: 0,
          wantCount: 0,
          notWantCount: 0,
          dimensionAvgs: {
            time: 0,
            speakers: 0,
            knowledge: 0,
            career: 0,
            facilities: 0,
            food: 0
          },
          attendeeDist: {},
          records: []
        };
      }

      var sumTime = 0;
      var sumSpeakers = 0;
      var sumKnowledge = 0;
      var sumCareer = 0;
      var sumFacilities = 0;
      var sumFood = 0;
      var wantCount = 0;
      var attendeeDist = {};

      records.forEach(function (r) {
        sumTime += Number(r.score_time) || 0;
        sumSpeakers += Number(r.score_speakers) || 0;
        sumKnowledge += Number(r.score_knowledge) || 0;
        sumCareer += Number(r.score_career) || 0;
        sumFacilities += Number(r.score_facilities) || 0;
        sumFood += Number(r.score_food) || 0;

        if (r.want_again === 'อยาก') {
          wantCount++;
        }

        var type = r.attendee_type || 'นักเรียน';
        attendeeDist[type] = (attendeeDist[type] || 0) + 1;
      });

      var avgTime = sumTime / total;
      var avgSpeakers = sumSpeakers / total;
      var avgKnowledge = sumKnowledge / total;
      var avgCareer = sumCareer / total;
      var avgFacilities = sumFacilities / total;
      var avgFood = sumFood / total;

      var grandAvg = (avgTime + avgSpeakers + avgKnowledge + avgCareer + avgFacilities + avgFood) / 6.0;
      var grandPct = (grandAvg / 5.0) * 100;
      var wantAgainPct = (wantCount / total) * 100;

      return {
        total: total,
        grandAvg: Number(grandAvg.toFixed(2)),
        grandPct: Number(grandPct.toFixed(1)),
        wantAgainPct: Number(wantAgainPct.toFixed(1)),
        wantCount: wantCount,
        notWantCount: total - wantCount,
        dimensionAvgs: {
          time: Number(avgTime.toFixed(2)),
          speakers: Number(avgSpeakers.toFixed(2)),
          knowledge: Number(avgKnowledge.toFixed(2)),
          career: Number(avgCareer.toFixed(2)),
          facilities: Number(avgFacilities.toFixed(2)),
          food: Number(avgFood.toFixed(2))
        },
        attendeeDist: attendeeDist,
        records: records
      };
    },

    /**
     * Fallback Direct POST ไปยัง Google Apps Script Webhook
     */
    submitToGas: async function (payload, gasUrl) {
      try {
        var response = await fetch(gasUrl, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        return {
          success: true,
          source: 'gas',
          data: payload
        };
      } catch (e) {
        throw new Error('Google Apps Script Fallback Error: ' + e.toString());
      }
    },

    /**
     * Background Mirror ไปยัง Google Sheets โดยไม่รบกวนความเร็วของผู้ใช้
     */
    mirrorToSheet: function (record, gasUrl) {
      if (!gasUrl) return;
      try {
        fetch(gasUrl, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(record)
        }).catch(function (e) {
          console.warn('Background sheet mirror delayed:', e);
        });
      } catch (err) {
        // Silent catch for background worker
      }
    },

    /**
     * ส่งออกไฟล์ CSV พร้อม UTF-8 BOM (\uFEFF) ป้องกันภาษาไทยเพี้ยนใน Microsoft Excel
     * (ตามกฎเหล็ก UX/UI Rule 3 ใน GEMINI.md)
     */
    exportToCsv: function (records, filename) {
      if (!records || records.length === 0) {
        alert('ไม่มีข้อมูลสำหรับส่งออกค่ะ');
        return;
      }

      var headers = [
        'ลำดับ',
        'วันเวลาที่ประเมิน',
        'ประเภทผู้ประเมิน',
        'สถาบัน/โรงเรียน',
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
        var dateStr = r.created_at ? new Date(r.created_at).toLocaleString('th-TH') : '-';

        return [
          index + 1,
          '"' + dateStr.replace(/"/g, '""') + '"',
          '"' + (r.attendee_type || 'นักเรียน').replace(/"/g, '""') + '"',
          '"' + (r.school_name || '-').replace(/"/g, '""') + '"',
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

      // ใส่ UTF-8 BOM (\uFEFF) เสมอ
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
