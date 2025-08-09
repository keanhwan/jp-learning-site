/*
 * 공통 자바스크립트 로직
 * - TTS 및 오디오 재생
 * - 학습 로그 기록
 * - 복습 세트 계산
 * - 퀴즈 생성
 */

const jpApp = {
  SOUND_ENABLED: false,
  /**
   * 일본어 TTS 읽기. 성공 시 true, 실패 시 false 반환.
   */
  speakJA(text) {
    if (!this.SOUND_ENABLED) return false;
    if ('speechSynthesis' in window) {
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = 'ja-JP';
      try {
        speechSynthesis.speak(utter);
        return true;
      } catch (e) {
        // TTS 재생 실패
      }
    }
    return false;
  },
  /**
   * 외부 오디오 파일 재생 (MP3/WAV)
   */
  playAudio(src) {
    if (!src) return;
    const audio = new Audio(src);
    audio.play();
  },
  /**
   * 소리 활성화
   */
  enableSound() {
    this.SOUND_ENABLED = true;
    localStorage.setItem('soundEnabled', '1');
    const btn = document.getElementById('btn-enable-sound');
    if (btn) btn.style.display = 'none';
  },
  /**
   * 소리 버튼 초기화
   */
  initSoundButton() {
    const saved = localStorage.getItem('soundEnabled');
    if (saved === '1') {
      this.SOUND_ENABLED = true;
      const btn = document.getElementById('btn-enable-sound');
      if (btn) btn.style.display = 'none';
    }
    const btn = document.getElementById('btn-enable-sound');
    if (btn) {
      btn.addEventListener('click', () => this.enableSound());
    }
  },
  /**
   * 학습 이벤트 기록
   */
  logStudy({ itemId, itemType, outcome }) {
    const log = JSON.parse(localStorage.getItem('studyLog') || '[]');
    log.push({ itemId, itemType, outcome, ts: Date.now() });
    localStorage.setItem('studyLog', JSON.stringify(log));
  },
  /**
   * KST YYYY-MM-DD 문자열 반환
   */
  _kstYMD(date) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(date);
  },
  /**
   * N일 전 날짜 객체 반환
   */
  _daysAgo(n) {
    return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
  },
  /**
   * 이벤트 목록을 정렬하여 ID 배열 반환
   */
  _rankEvents(events) {
    const score = { wrong: 3, correct: 2, view: 1 };
    const map = {};
    events.forEach(e => {
      const id = e.itemId;
      const prev = map[id] || { itemId: id, best: 0, lastTs: 0 };
      const s = score[e.outcome] || 0;
      map[id] = {
        itemId: id,
        best: Math.max(prev.best, s),
        lastTs: Math.max(prev.lastTs, e.ts)
      };
    });
    return Object.values(map)
      .sort((a, b) => b.best - a.best || a.lastTs - b.lastTs)
      .map(r => r.itemId);
  },
  /**
   * 어제 복습 세트 계산
   */
  getYesterdayReviewSet(max = 30) {
    const log = JSON.parse(localStorage.getItem('studyLog') || '[]');
    const target = this._kstYMD(this._daysAgo(1));
    const events = log.filter(e => this._kstYMD(new Date(e.ts)) === target);
    return this._rankEvents(events).slice(0, max);
  },
  /**
   * 지난 7일(어제까지) 복습 세트 계산
   */
  getLast7DaysReviewSet(max = 30) {
    const log = JSON.parse(localStorage.getItem('studyLog') || '[]');
    const start = this._kstYMD(this._daysAgo(7));
    const end = this._kstYMD(this._daysAgo(1));
    const events = log.filter(e => {
      const d = this._kstYMD(new Date(e.ts));
      return d >= start && d <= end;
    });
    return this._rankEvents(events).slice(0, max);
  },
  /**
   * 퀴즈 페이지로 이동
   */
  startQuiz(itemIds) {
    if (!itemIds || !itemIds.length) {
      alert('복습할 항목이 없습니다.');
      return;
    }
    localStorage.setItem('quizItems', JSON.stringify(itemIds));
    // 상대 경로 처리: 현재 페이지 위치에 따라 이동
    const base = window.location.pathname.replace(/\/[^\/]*$/, '');
    window.location.href = base + '/quiz.html';
  },
  /**
   * 일일 플랜 JSON 로드
   */
  loadDailyPlan(callback) {
    fetch('../data/daily_plan.json?v=2025-08')
      .then(res => res.json())
      .then(callback)
      .catch(() => {
        console.error('daily_plan.json 로드 실패');
        callback([]);
      });
  },
  /**
   * 아이템 ID로 퀴즈 데이터 생성
   */
  generateQuizData(itemIds, plan) {
    const items = [];
    plan.forEach((day, di) => {
      // 단어
      day.words.forEach((w, wi) => {
        const id = `D${di + 1}W${wi + 1}`;
        if (itemIds.includes(id)) {
          items.push({ id, type: 'word', jp: w.jp, ko: w.ko });
        }
      });
      // 패턴
      const pid = `D${di + 1}P`;
      if (itemIds.includes(pid)) {
        items.push({ id: pid, type: 'pattern', jp: day.pattern, ko: day.pattern_ko });
      }
    });
    return items;
  },
  /**
   * 퀴즈 페이지 빌드
   */
  buildQuizPage() {
    const itemIds = JSON.parse(localStorage.getItem('quizItems') || '[]');
    const container = document.getElementById('quiz-container');
    if (!itemIds.length) {
      if (container) container.textContent = '퀴즈 항목이 없습니다.';
      return;
    }
    this.loadDailyPlan(plan => {
      const items = this.generateQuizData(itemIds, plan);
      let current = 0;
      const showNext = () => {
        if (!container) return;
        if (current >= items.length) {
          container.innerHTML = '<p>퀴즈 완료! 홈으로 돌아가세요.</p>';
          return;
        }
        const item = items[current];
        const questionEl = document.createElement('div');
        questionEl.className = 'question';
        const prompt = document.createElement('h3');
        prompt.textContent = item.jp;
        questionEl.appendChild(prompt);
        // 정답 설정
        const answer = item.ko;
        // 선택지 생성
        const options = [answer];
        while (options.length < 4) {
          const rd = plan[Math.floor(Math.random() * plan.length)];
          const rw = rd.words[Math.floor(Math.random() * rd.words.length)].ko;
          if (!options.includes(rw)) options.push(rw);
        }
        // 섞기
        options.sort(() => Math.random() - 0.5);
        options.forEach(opt => {
          const btn = document.createElement('button');
          btn.textContent = opt;
          btn.onclick = () => {
            this.logStudy({ itemId: item.id, itemType: item.type, outcome: opt === answer ? 'correct' : 'wrong' });
            current++;
            showNext();
          };
          questionEl.appendChild(btn);
        });
        container.innerHTML = '';
        container.appendChild(questionEl);
      };
      showNext();
    });
  }
};

// 페이지 로드 시 소리 버튼 초기화
document.addEventListener('DOMContentLoaded', () => {
  jpApp.initSoundButton();
});