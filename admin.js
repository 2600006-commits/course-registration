// admin.js
// admin.html 전용 스크립트: 로그인 여부 + 관리자 권한(admins 컬렉션 등록 여부)을 확인하고,
// 둘 중 하나라도 만족하지 않으면 즉시 index.html로 돌려보냅니다.
import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const statusEl = document.getElementById("admin-status");
const contentEl = document.getElementById("admin-content");

function redirectToHome(message) {
  if (message) alert(message);
  window.location.href = "index.html";
}

onAuthStateChanged(auth, async (user) => {
  // 1. 로그인 자체가 안 되어 있으면 (또는 익명 로그인 상태면) 접근 차단
  if (!user || user.isAnonymous) {
    redirectToHome("관리자 로그인이 필요합니다.");
    return;
  }

  // 2. 로그인은 되어 있지만 관리자 목록(admins/{uid})에 없으면 접근 차단
  try {
    const adminDoc = await getDoc(doc(db, "admins", user.uid));
    if (!adminDoc.exists()) {
      await signOut(auth);
      redirectToHome("관리자 권한이 없는 계정입니다.");
      return;
    }
  } catch (error) {
    console.error("관리자 권한 확인 실패:", error);
    redirectToHome("권한을 확인하는 중 오류가 발생했습니다.");
    return;
  }

  // 3. 통과: 관리자 화면 표시
  statusEl.style.display = "none";
  contentEl.style.display = "block";
});

document.getElementById("logout-btn").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});
