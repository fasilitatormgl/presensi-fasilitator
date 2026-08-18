const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");

admin.initializeApp();

setGlobalOptions({
  region: "asia-southeast2",
  maxInstances: 10
});

const db = admin.firestore();

async function requireAdmin(request) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Anda harus login.");
  }

  const caller = await db.collection("users").doc(request.auth.uid).get();

  if (!caller.exists || caller.data().role !== "admin") {
    throw new HttpsError("permission-denied", "Hanya admin yang boleh melakukan tindakan ini.");
  }

  return caller.data();
}

function cleanString(value, fallback = null) {
  if (value === undefined || value === null) return fallback;
  const text = String(value).trim();
  return text === "" ? fallback : text;
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(password) {
  return typeof password === "string" && password.length >= 6;
}

exports.adminUserAction = onCall(async (request) => {
  await requireAdmin(request);

  const data = request.data || {};
  const action = cleanString(data.action);

  try {
    if (action === "create") {
      const email = cleanString(data.email);
      const password = data.password;
      const nama = cleanString(data.nama, "User");
      const role = cleanString(data.role, "user");
      const kelurahan = cleanString(data.kelurahan);
      const kecamatan = cleanString(data.kecamatan);
      const kota = cleanString(data.kota);
      const active = data.active !== false;
      const deviceCheckEnabled = data.deviceCheckEnabled !== false;

      if (!email || !validateEmail(email)) {
        throw new HttpsError("invalid-argument", "Email tidak valid.");
      }
      if (!validatePassword(password)) {
        throw new HttpsError("invalid-argument", "Password minimal 6 karakter.");
      }

      const authUser = await admin.auth().createUser({
        email,
        password,
        displayName: nama,
        disabled: !active
      });

      const now = admin.firestore.FieldValue.serverTimestamp();

      await db.collection("users").doc(authUser.uid).set({
        uid: authUser.uid,
        nama,
        email,
        role,
        kecamatan,
        kelurahan,
        kota,
        active,
        deviceCheckEnabled,
        deviceId: null,
        deviceResetAt: now,
        createdAt: now,
        updatedAt: now
      });

      return {
        success: true,
        uid: authUser.uid,
        message: "Akun berhasil dibuat."
      };
    }

    if (action === "update") {
      const uid = cleanString(data.uid);
      if (!uid) throw new HttpsError("invalid-argument", "UID wajib diisi.");

      const updates = {};
      const authUpdates = {};

      if (data.email !== undefined) {
        const email = cleanString(data.email);
        if (!email || !validateEmail(email)) {
          throw new HttpsError("invalid-argument", "Email tidak valid.");
        }
        authUpdates.email = email;
        updates.email = email;
      }

      if (data.password !== undefined && data.password !== "") {
        if (!validatePassword(data.password)) {
          throw new HttpsError("invalid-argument", "Password minimal 6 karakter.");
        }
        authUpdates.password = data.password;
      }

      if (data.nama !== undefined) {
        updates.nama = cleanString(data.nama, "User");
        authUpdates.displayName = updates.nama;
      }

      if (data.active !== undefined) {
        updates.active = Boolean(data.active);
        authUpdates.disabled = !updates.active;
      }

      if (data.role !== undefined) updates.role = cleanString(data.role, "user");
      if (data.kecamatan !== undefined) updates.kecamatan = cleanString(data.kecamatan);
      if (data.kelurahan !== undefined) updates.kelurahan = cleanString(data.kelurahan);
      if (data.kota !== undefined) updates.kota = cleanString(data.kota);
      if (data.deviceCheckEnabled !== undefined) {
        updates.deviceCheckEnabled = Boolean(data.deviceCheckEnabled);
      }

      await admin.auth().updateUser(uid, authUpdates);

      updates.updatedAt = admin.firestore.FieldValue.serverTimestamp();
      await db.collection("users").doc(uid).set(updates, { merge: true });

      return { success: true, uid, message: "Akun berhasil diperbarui." };
    }

    if (action === "setDisabled") {
      const uid = cleanString(data.uid);
      if (!uid) throw new HttpsError("invalid-argument", "UID wajib diisi.");

      const disabled = Boolean(data.disabled);

      await admin.auth().updateUser(uid, { disabled });

      await db.collection("users").doc(uid).set({
        active: !disabled,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      return {
        success: true,
        uid,
        active: !disabled,
        message: disabled ? "Akun dinonaktifkan." : "Akun diaktifkan."
      };
    }

    if (action === "delete") {
      const uid = cleanString(data.uid);
      if (!uid) throw new HttpsError("invalid-argument", "UID wajib diisi.");
      if (uid === request.auth.uid) {
        throw new HttpsError("failed-precondition", "Admin yang sedang login tidak boleh menghapus dirinya sendiri.");
      }

      await admin.auth().deleteUser(uid);
      await db.collection("users").doc(uid).delete();

      return { success: true, uid, message: "Akun Auth dan data Firestore berhasil dihapus." };
    }

    if (action === "resetDevice") {
      const uid = cleanString(data.uid);
      if (!uid) throw new HttpsError("invalid-argument", "UID wajib diisi.");

      await db.collection("users").doc(uid).set({
        deviceId: null,
        deviceResetAt: admin.firestore.FieldValue.serverTimestamp(),
        lastResetBy: request.auth.uid,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      return { success: true, uid, message: "Device berhasil direset." };
    }

    if (action === "resetAllDevices") {
      const snapshot = await db.collection("users").get();
      const writer = db.bulkWriter();
      let count = 0;

      snapshot.forEach((userDoc) => {
        writer.update(userDoc.ref, {
          deviceId: null,
          deviceResetAt: admin.firestore.FieldValue.serverTimestamp(),
          lastResetBy: request.auth.uid,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        count++;
      });

      await writer.close();

      return {
        success: true,
        count,
        message: `${count} user berhasil direset device.`
      };
    }

    throw new HttpsError("invalid-argument", `Action tidak dikenal: ${action}`);
  } catch (error) {
    console.error("adminUserAction:", error);

    if (error instanceof HttpsError) throw error;

    let code = "internal";
    if (error.code === "auth/email-already-exists") code = "already-exists";
    if (error.code === "auth/user-not-found") code = "not-found";
    if (error.code === "auth/invalid-email") code = "invalid-argument";
    if (error.code === "auth/weak-password") code = "invalid-argument";

    throw new HttpsError(code, error.message || "Operasi gagal.");
  }
});

