// app.js
import { db, auth } from "./firebase-config.js";
import { collection, onSnapshot, doc, getDoc, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { signInWithEmailAndPassword, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// 최근에 받은 과목 목록 캐시 + 신청 시작 여부
// (아래 타이머 로직이 course-list 로직보다 먼저 실행되므로, 이 변수들은
//  반드시 파일 맨 위에서 미리 선언해둬야 합니다)
let latestCourses = [];
let registrationStarted = false;

// app.js 상단에 추가
let timeOffset = 0; // 서버와 내 PC 시간의 차이

// 외부 API를 통해 실제 한국 표준시(KST) 가져오기
async function syncServerTime() {
  try {
    const response = await fetch('https://worldtimeapi.org/api/timezone/Asia/Seoul');
    const data = await response.json();
    const realServerTime = new Date(data.datetime).getTime();
    const myLocalTime = new Date().getTime();
    
    timeOffset = realServerTime - myLocalTime; // 오차 저장
    console.log("시간 동기화 완료. 오차(ms):", timeOffset);
  } catch (error) {
    console.error("시간 동기화 실패, 로컬 시간으로 대체합니다.", error);
  }
}

// 정확한 현재 시간을 반환하는 함수
function getAccurateTime() {
  return new Date().getTime() + timeOffset;
}

// 앱 시작 시 시간 동기화 실행
syncServerTime();

// Firestore 보안 규칙이 request.auth != null 을 요구하므로,
// 로그인하지 않은 일반 방문자는 익명 인증으로 자동 로그인시킵니다.
// (Firebase 콘솔 > Authentication > Sign-in method 에서 '익명' 로그인을 켜야 동작합니다)
signInAnonymously(auth).catch((error) => {
  console.error("익명 로그인 실패:", error);
});

// ── 신청 시작 카운트다운 타이머 ─────────────────────────────
// Firestore의 settings/registrationTime 문서(필드: startAt, Timestamp 타입)를
// 기준으로 남은 시간을 계산합니다. 관리자가 이 문서의 startAt 값을 바꾸면
// 자동으로 반영됩니다. 문서가 없으면 신청을 바로 열어둔 것으로 간주합니다.
const timerDisplayEl = document.getElementById("timer-display");
const timerLabelEl = document.getElementById("timer-label");
let registrationStartTime = null; // ms epoch, null이면 시각 미설정

function pad(n) {
  return String(n).padStart(2, "0");
}

async function initRegistrationTimer() {
  try {
    const settingsDoc = await getDoc(doc(db, "settings", "registrationTime"));
    if (settingsDoc.exists() && settingsDoc.data().startAt) {
      registrationStartTime = settingsDoc.data().startAt.toDate().getTime();
    } else {
      // 설정된 시각이 없으면 신청을 막지 않습니다.
      registrationStarted = true;
    }
  } catch (error) {
    console.error("신청 시작 시각을 불러오지 못했습니다:", error);
    registrationStarted = true; // 실패 시에도 신청이 완전히 막히지는 않도록 처리
  }
  updateTimerDisplay();
  setInterval(updateTimerDisplay, 1000);
}

function updateTimerDisplay() {
  if (registrationStartTime === null) {
    if (timerLabelEl) timerLabelEl.innerText = "신청이 진행 중입니다";
    if (timerDisplayEl) timerDisplayEl.innerText = "00:00:00";
    return;
  }

  const now = getAccurateTime();
  const diff = registrationStartTime - now;

  if (diff <= 0) {
    if (timerDisplayEl) timerDisplayEl.innerText = "00:00:00";
    if (timerLabelEl) timerLabelEl.innerText = "신청이 시작되었습니다!";
    if (!registrationStarted) {
      registrationStarted = true;
      renderCourses(); // 대기중 -> 신청하기 버튼으로 다시 그리기
    }
    return;
  }

  registrationStarted = false;
  const totalSeconds = Math.floor(diff / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (timerDisplayEl) timerDisplayEl.innerText = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  if (timerLabelEl) timerLabelEl.innerText = "신청 시작까지 남은 시간";
}

initRegistrationTimer();

// 네트워크 끊김 안내 배너 표시/숨김
const networkBanner = document.getElementById("network-banner");
function updateNetworkBanner() {
  networkBanner.style.display = navigator.onLine ? "none" : "block";
}
window.addEventListener("online", updateNetworkBanner);
window.addEventListener("offline", updateNetworkBanner);
updateNetworkBanner();

// UI 요소
const courseListEl = document.getElementById("course-list");
const themeToggle = document.getElementById("theme-toggle");
const modal = document.getElementById("apply-modal");
let selectedCourseId = null;

// 최근에 받은 과목 목록 캐시 + 신청 시작 여부
// (타이머가 시작 시각을 지나는 순간에도 목록을 다시 그려야 하므로 캐시해둡니다)

// 1. 다크모드 토글
themeToggle.addEventListener("click", () => {
  document.body.classList.toggle("dark-theme");
});

// 2. 실시간 과목 리스트 불러오기 (Firestore)
onSnapshot(collection(db, "courses"), (snapshot) => {
  latestCourses = snapshot.docs.map((d) => ({ id: d.id, data: d.data() }));
  renderCourses();
});

function renderCourses() {
  courseListEl.innerHTML = ""; // 초기화
  latestCourses.forEach(({ id: courseId, data: course }) => {
    const remaining = course.capacity - course.enrolledCount;
    // 신청 시작 전이면 잔여석과 무관하게 버튼을 막아둡니다.
    const isDisabled = remaining <= 0 || !registrationStarted;
    let buttonLabel = "신청하기";
    if (!registrationStarted) buttonLabel = "신청 대기중";
    else if (remaining <= 0) buttonLabel = "마감";

    // 카드 UI 생성
    const card = document.createElement("div");
    card.className = "course-card";
    card.innerHTML = `
      <h3>${course.name}</h3>
      <p>정원: ${course.enrolledCount} / ${course.capacity} (잔여: ${remaining}석)</p>
      <button class="apply-btn" ${isDisabled ? "disabled" : ""}>
        ${buttonLabel}
      </button>
    `;

    // 신청 버튼 이벤트
    card.querySelector(".apply-btn").addEventListener("click", () => {
      selectedCourseId = courseId;
      document.getElementById("modal-course-name").innerText = course.name;
      modal.style.display = "flex";
    });

    courseListEl.appendChild(card);
  });
}

// 3. 수강신청 트랜잭션 (동시성 제어)
document.getElementById("confirm-apply-btn").addEventListener("click", async () => {
  const studentId = document.getElementById("student-id").value;
  const studentName = document.getElementById("student-name").value;

  if(!studentId || !studentName) return alert("정보를 모두 입력하세요.");
  if(!registrationStarted) return alert("아직 신청 시작 전입니다.");

  const courseRef = doc(db, "courses", selectedCourseId);
  const regRef = doc(db, "registrations", `${studentId}_${selectedCourseId}`); // 학번_과목 방식을 통한 중복 방지

  try {
    await runTransaction(db, async (transaction) => {
      const courseDoc = await transaction.get(courseRef);
      if (!courseDoc.exists()) throw "과목 없음";
      
      const courseData = courseDoc.data();

      // 이미 신청했는지 체크
      const regDoc = await transaction.get(regRef);
      if (regDoc.exists()) throw "이미 신청한 과목입니다.";

      // 선착순 체크
      if (courseData.enrolledCount < courseData.capacity) {
        transaction.update(courseRef, { enrolledCount: courseData.enrolledCount + 1 });
        transaction.set(regRef, {
          studentId, studentName, courseId: selectedCourseId, status: "enrolled", timestamp: serverTimestamp()
        });
      } else {
        throw "정원이 마감되었습니다.";
      }
    });
    alert("신청 성공!");
    modal.style.display = "none";
  } catch (error) {
    alert("신청 실패: " + error);
  }
});

// 4. 모달 닫기
document.getElementById("close-modal-btn").addEventListener("click", () => {
  modal.style.display = "none";
});

// 4-1. 관리자 로그인 모달 닫기
document.getElementById("close-admin-modal-btn").addEventListener("click", () => {
  document.getElementById("admin-login-modal").style.display = "none";
});

const adminLoginModal = document.getElementById("admin-login-modal");

// 헤더의 관리자 버튼 클릭 시
document.getElementById("admin-btn").addEventListener("click", () => {
  adminLoginModal.style.display = "flex";
});

// 로그인 버튼 클릭 시
document.getElementById("admin-login-btn").addEventListener("click", async () => {
  const email = document.getElementById("admin-email").value;
  const password = document.getElementById("admin-password").value;

  try {
    await signInWithEmailAndPassword(auth, email, password);
    alert("관리자 로그인 성공!");
    adminLoginModal.style.display = "none";
    
    // 로그인 성공 시 관리자 전용 대시보드 화면(admin.html)으로 이동시키거나
    // 현재 화면의 UI를 관리자용으로 렌더링하도록 변경합니다.
    window.location.href = "admin.html"; 
    
  } catch (error) {
    alert("로그인 실패: 이메일이나 비밀번호를 확인해주세요.");
  }
});
