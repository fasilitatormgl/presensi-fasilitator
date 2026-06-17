import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js"
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js"
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js"

// KONFIGURASI FIREBASE 
const firebaseConfig = {
  apiKey: "AIzaSyCPANSke88xjUP0Lqpl2PoHSDu-xYtfAkQ",
  authDomain: "presensi-fasilitator.firebaseapp.com",
  projectId: "presensi-fasilitator",
  storageBucket: "presensi-fasilitator.firebasestorage.app",
  messagingSenderId: "317527501418",
  appId: "1:317527501418:web:cdefb307e227796479f813"
};

// Inisialisasi Firebase
const app = initializeApp(firebaseConfig)
const auth = getAuth(app)
const db = getFirestore(app)

console.log("✅ Firebase initialized")

export { auth, db }