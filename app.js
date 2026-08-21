// app.js
import { db } from "./firebase-config.js";
import { collection, onSnapshot, doc, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// UI 요소
const courseListEl = document.getElementById("course-list");
const themeToggle = document.getElementById("theme-toggle");
const modal = document.getElementById("apply-modal");
let selectedCourseId = null;

// 1. 다크모드 토글
themeToggle.addEventListener("click", () => {
  document.body.classList.toggle("dark-theme");
});

// 2. 실시간 과목 리스트 불러오기 (Firestore)
onSnapshot(collection(db, "courses"), (snapshot) => {
  courseListEl.innerHTML = ""; // 초기화
  snapshot.forEach((doc) => {
    const course = doc.data();
    const courseId = doc.id;
    const remaining = course.capacity - course.enrolledCount;
    
    // 카드 UI 생성
    const card = document.createElement("div");
    card.className = "course-card";
    card.innerHTML = `
      <h3>${course.name}</h3>
      <p>정원: ${course.enrolledCount} / ${course.capacity} (잔여: ${remaining}석)</p>
      <button class="apply-btn" ${remaining <= 0 ? 'disabled' : ''}>
        ${remaining <= 0 ? '마감' : '신청하기'}
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
});

// 3. 수강신청 트랜잭션 (동시성 제어)
document.getElementById("confirm-apply-btn").addEventListener("click", async () => {
  const studentId = document.getElementById("student-id").value;
  const studentName = document.getElementById("student-name").value;

  if(!studentId || !studentName) return alert("정보를 모두 입력하세요.");

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