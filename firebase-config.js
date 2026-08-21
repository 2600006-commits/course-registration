// firebase-config.js
// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyB60iMwr7KXJvXJfmMIIpzxBmLIfEuLsSw",
  authDomain: "course-registration-a254b.firebaseapp.com",
  databaseURL: "https://course-registration-a254b-default-rtdb.firebaseio.com",
  projectId: "course-registration-a254b",
  storageBucket: "course-registration-a254b.firebasestorage.app",
  messagingSenderId: "355584544525",
  appId: "1:355584544525:web:1f772d5a02d4a569deea44",
  measurementId: "G-9H8XBHTN70"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// db, auth를 다른 파일(app.js)에서 가져다 쓸 수 있도록 export
export const db = getFirestore(app);
export const auth = getAuth(app);
