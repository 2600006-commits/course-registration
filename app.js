// app.js
import { db, auth } from "./firebase-config.js";
import { collection, onSnapshot, doc, getDoc, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { signInWithEmailAndPassword, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// ══════════════════════════════════════════════════════════
// 0. UI 요소 확보 + 순수 UI 이벤트 연결 (Firebase와 무관하게 항상 먼저 동작)
//    ※ 아래쪽 Firebase 관련 코드에서 에러가 나더라도 여기서 이미 연결된
//      이벤트 리스너들은 영향을 받지 않도록, 반드시 파일 맨 위에서 처리합니다.
// ══════════════════════════════════════════════════════════
const courseListEl = document.getElementById("course-list");
const themeToggle = document.getElementById("theme-toggle");
const modal = document.getElementById("apply-modal");
const adminLoginModal = document.getElementById("admin-login-modal");
const timerDisplayEl = document.getElementById("timer-display");
const timerLabelEl = document.getElementById("timer-label");
const networkBanner = document.getElementById("network-banner");

let selectedCourseId = null;
let latestCourses = [];
let registrationStarted = false;
let registrationStartTime = null; // ms epoch, null이면 시각 미설정

// 1. 다크모드 토글
themeToggle.addEventListener("click", () => {
  document.body.classList.toggle("dark-theme");
});

// 2. 신청 모달 닫기
document.getElementById("close-modal-btn").addEventListener("click", () => {
  modal.style.display = "none";
});

// 3. 관리자 로그인 모달 열기/닫기
document.getElementById("admin-btn").addEventListener("click", () => {
  adminLoginModal.style.display = "flex";
});
document.getElementById("close-admin-modal-btn").addEventListener("click", () => {
  adminLoginModal.style.display = "none";
});

// 4. 네트워크 끊김 안내 배너
function updateNetworkBanner() {
  networkBanner.style.display = navigator.onLine ? "none" : "block";
}
window.addEventListener("online", updateNetworkBanner);
window.addEventListener("offline", updateNetworkBanner);
updateNetworkBanner();

// ══════════════════════════════════════════════════════════
// 이 아래부터는 전부 Firebase(네트워크)에 의존하는 기능입니다.
// 각 기능을 독립적으로 try/catch 하여, 하나가 실패해도
// (예: Firestore 규칙 미배포, 익명 로그인 미설정 등)
// 다른 기능과 위쪽 UI 이벤트는 계속 정상 동작하도록 합니다.
// ══════════════════════════════════════════════════════════

// 5. 서버 시간 동기화
let timeOffset = 0; // 서버와 내 PC 시간의 차이
async function syncServerTime() {
  try {
    const response = await fetch('https://worldtimeapi.org/api/timezone/Asia/Seoul');
    const data = await response.json();
    const realServerTime = new Date(data.datetime).getTime();
    const myLocalTime = new Date().getTime();
    timeOffset = realServerTime - myLocalTime;
    console.log("시간 동기화 완료. 오차(ms):", timeOffset);
  } catch (error) {
    console.error("시간 동기화 실패, 로컬 시간으로 대체합니다.", error);
  }
}
function getAccurateTime() {
  return new Date().getTime() + timeOffset;
}
syncServerTime();

// 6. 익명 로그인 (Firestore 보안 규칙이 request.auth != null 을 요구하므로 필요)
//    Firebase 콘솔 > Authentication > Sign-in method 에서 '익명' 로그인을 켜야 동작합니다.
try {
  signInAnonymously(auth).catch((error) => {
    console.error("익명 로그인 실패:", error);
  });
} catch (error) {
  console.error("익명 로그인 호출 자체가 실패했습니다:", error);
}

// 7. 신청 시작 카운트다운 타이머
//    Firestore의 settings/registrationTime 문서(필드: startAt, Timestamp)를 기준으로 계산합니다.
//    문서가 없거나 오류가 나면 신청을 막지 않고 바로 열어둔 것으로 처리합니다.
function pad(n) {
  return String(n).padStart(2, "0");
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
      renderCourses();
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

async function initRegistrationTimer() {
  try {
    const settingsDoc = await getDoc(doc(db, "settings", "registrationTime"));
    if (settingsDoc.exists() && settingsDoc.data().startAt) {
      registrationStartTime = settingsDoc.data().startAt.toDate().getTime();
    } else {
      registrationStarted = true;
    }
  } catch (error) {
    console.error("신청 시작 시각을 불러오지 못했습니다:", error);
    registrationStarted = true;
  }
  updateTimerDisplay();
  setInterval(updateTimerDisplay, 1000);
}
initRegistrationTimer();

// 8. 실시간 과목 리스트 렌더링
function renderCourses() {
  courseListEl.innerHTML = "";
  latestCourses.forEach(({ id: courseId, data: course }) => {
    const remaining = course.capacity - course.enrolledCount;
    const isDisabled = remaining <= 0 || !registrationStarted;
    let buttonLabel = "신청하기";
    if (!registrationStarted) buttonLabel = "신청 대기중";
    else if (remaining <= 0) buttonLabel = "마감";

    const card = document.createElement("div");
    card.className = "course-card";
    card.innerHTML = `
      <h3>${course.name}</h3>
      <p>정원: ${course.enrolledCount} / ${course.capacity} (잔여: ${remaining}석)</p>
      <button class="apply-btn" ${isDisabled ? "disabled" : ""}>
        ${buttonLabel}
      </button>
    `;

    card.querySelector(".apply-btn").addEventListener("click", () => {
      selectedCourseId = courseId;
      document.getElementById("modal-course-name").innerText = course.name;
      modal.style.display = "flex";
    });

    courseListEl.appendChild(card);
  });
}

try {
  onSnapshot(
    collection(db, "courses"),
    (snapshot) => {
      latestCourses = snapshot.docs.map((d) => ({ id: d.id, data: d.data() }));
      renderCourses();
    },
    (error) => {
      console.error("과목 목록을 불러오지 못했습니다:", error);
      courseListEl.innerHTML = "<p>과목 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.</p>";
    }
  );
} catch (error) {
  console.error("onSnapshot 등록 실패:", error);
}

// 9. 수강신청 트랜잭션 (동시성 제어)
document.getElementById("confirm-apply-btn").addEventListener("click", async () => {
  const studentId = document.getElementById("student-id").value;
  const studentName = document.getElementById("student-name").value;

  if (!studentId || !studentName) return alert("정보를 모두 입력하세요.");
  if (!registrationStarted) return alert("아직 신청 시작 전입니다.");

  const courseRef = doc(db, "courses", selectedCourseId);
  const regRef = doc(db, "registrations", `${studentId}_${selectedCourseId}`);

  try {
    await runTransaction(db, async (transaction) => {
      const courseDoc = await transaction.get(courseRef);
      if (!courseDoc.exists()) throw "과목 없음";

      const courseData = courseDoc.data();

      const regDoc = await transaction.get(regRef);
      if (regDoc.exists()) throw "이미 신청한 과목입니다.";

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

// 10. 관리자 로그인
document.getElementById("admin-login-btn").addEventListener("click", async () => {
  const email = document.getElementById("admin-email").value;
  const password = document.getElementById("admin-password").value;

  try {
    await signInWithEmailAndPassword(auth, email, password);
    alert("관리자 로그인 성공!");
    adminLoginModal.style.display = "none";
    window.location.href = "admin.html";
  } catch (error) {
    console.error("관리자 로그인 실패:", error);
    alert("로그인 실패: 이메일이나 비밀번호를 확인해주세요.");
  }
});
