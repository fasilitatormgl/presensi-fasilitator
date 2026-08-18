import { auth, db } from "./firebase-init.js"

import {
    collection,
    getDocs,
    doc,
    getDoc
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js"

import {
    signOut
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js"

import {
    getRekapHarian,
    getRekapBulanan,
    getExportHarian,
    getExportBulanan
} from "./rekap.js"


// =====================================================
// GLOBAL
// =====================================================

let userData = {}

let currentFilter = {

    bulan:
        new Date().getMonth() + 1,

    tahun:
        new Date().getFullYear(),

    kelurahan: "",

    tanggal:
        new Date()
            .toISOString()
            .split("T")[0]

}

let allUsers = []

let allPresensi = []


// =====================================================
// LOGOUT
// =====================================================

async function logout() {

    if (
        !confirm(
            "Apakah Anda yakin ingin keluar?"
        )
    ) {
        return
    }


    try {

        await signOut(auth)

        localStorage.clear()

        window.location.href =
            "index.html"

    } catch (error) {

        console.error(
            "Logout error:",
            error
        )

        alert(
            "Gagal logout: " +
            error.message
        )

    }

}


// =====================================================
// LOADING
// =====================================================

function showLoading(show) {

    const el =
        document.getElementById(
            "loading"
        )


    if (el) {

        el.style.display =
            show
                ? "flex"
                : "none"

    }

}


// =====================================================
// ERROR
// =====================================================

function showError(message) {

    const modal =
        document.getElementById(
            "errorModal"
        )

    const messageEl =
        document.getElementById(
            "errorMessage"
        )


    if (
        modal &&
        messageEl
    ) {

        messageEl.textContent =
            message

        modal.style.display =
            "flex"

    } else {

        alert(message)

    }

}


window.closeErrorModal =
    function () {

        const modal =
            document.getElementById(
                "errorModal"
            )


        if (modal) {

            modal.style.display =
                "none"

        }

    }


// =====================================================
// FORMAT BULAN
// =====================================================

function formatBulan(
    bulan,
    tahun
) {

    const namaBulan = [

        "Januari",
        "Februari",
        "Maret",
        "April",
        "Mei",
        "Juni",
        "Juli",
        "Agustus",
        "September",
        "Oktober",
        "November",
        "Desember"

    ]


    return `
        ${namaBulan[bulan - 1]}
        ${tahun}
    `

}


// =====================================================
// INIT
// =====================================================

window.addEventListener(
    "load",
    async () => {

        showLoading(true)


        try {

            const storedData =
                localStorage.getItem(
                    "userData"
                )


            if (storedData) {

                userData =
                    JSON.parse(
                        storedData
                    )

            }


            if (
                !userData ||
                userData.role !==
                    "pemantau"
            ) {

                window.location.href =
                    "index.html"

                return

            }


            // =========================================
            // USER INFO
            // =========================================

            const userName =
                document.getElementById(
                    "userName"
                )


            if (userName) {

                userName.textContent =
                    userData.nama ||
                    "Pemantau"

            }


            const avatar =
                document.getElementById(
                    "avatar"
                )


            if (avatar) {

                avatar.textContent =
                    (
                        userData.nama ||
                        "P"
                    )
                    .charAt(0)
                    .toUpperCase()

            }


            const userRole =
                document.getElementById(
                    "userRole"
                )


            if (userRole) {

                userRole.textContent =
                    "Pemantau - Monitoring"

            }


            const logoutBtn =
                document.getElementById(
                    "logoutBtn"
                )


            if (logoutBtn) {

                logoutBtn.addEventListener(
                    "click",
                    logout
                )

            }


            // =========================================
            // FILTER DEFAULT
            // =========================================

            const sekarang =
                new Date()


            const bulanEl =
                document.getElementById(
                    "filterBulan"
                )


            const tahunEl =
                document.getElementById(
                    "filterTahun"
                )


            if (bulanEl) {

                bulanEl.value =
                    sekarang.getMonth() + 1

            }


            if (tahunEl) {

                tahunEl.value =
                    sekarang.getFullYear()

            }


            const tanggalEl =
                document.getElementById(
                    "filterTanggal"
                )


            if (tanggalEl) {

                tanggalEl.value =
                    sekarang
                    .toISOString()
                    .split("T")[0]

            }


            // =========================================
            // LOAD DATA
            // =========================================

            await loadData()

            await loadFilterOptions()

            await cekStatusLokasiAktif()

            await loadRekapBulanan()

            await loadRekapHarian()


            console.log(
                "Dashboard pemantau siap"
            )


        } catch (error) {

            console.error(
                "Dashboard error:",
                error
            )

            showError(
                "Gagal memuat dashboard: " +
                error.message
            )

        } finally {

            showLoading(false)

        }

    }
)


// =====================================================
// LOAD DATA
// =====================================================

async function loadData() {

    const usersSnap =
        await getDocs(
            collection(db, "users")
        )


    allUsers = []


    usersSnap.forEach(
        docSnap => {

            const data =
                docSnap.data()


            if (
                data.role ===
                    "admin" ||
                data.role ===
                    "pemantau"
            ) {

                return

            }


            allUsers.push({

                id:
                    docSnap.id,

                uid:
                    data.uid ||
                    docSnap.id,

                ...data

            })

        }
    )


    const presensiSnap =
        await getDocs(
            collection(db, "presensi")
        )


    allPresensi = []


    presensiSnap.forEach(
        docSnap => {

            allPresensi.push({

                id:
                    docSnap.id,

                ...docSnap.data()

            })

        }
    )


    console.log(
        "User:",
        allUsers.length
    )

    console.log(
        "Presensi:",
        allPresensi.length
    )

}


// =====================================================
// FILTER KELURAHAN
// =====================================================

async function loadFilterOptions() {

    const kelurahanSet =
        new Set()


    allUsers.forEach(
        user => {

            if (
                user.kelurahan &&
                user.kelurahan !== "-"
            ) {

                kelurahanSet.add(
                    user.kelurahan
                )

            }

        }
    )


    const select =
        document.getElementById(
            "filterKelurahan"
        )


    if (!select) {
        return
    }


    select.innerHTML =
        `
            <option value="">
                Semua Kelurahan
            </option>
        `


    Array.from(
        kelurahanSet
    )
    .sort()
    .forEach(
        kelurahan => {

            const option =
                document.createElement(
                    "option"
                )


            option.value =
                kelurahan


            option.textContent =
                kelurahan


            select.appendChild(
                option
            )

        }
    )

}


// =====================================================
// REKAP BULANAN
// =====================================================

async function loadRekapBulanan() {

    const bulanEl =
        document.getElementById(
            "filterBulan"
        )


    const tahunEl =
        document.getElementById(
            "filterTahun"
        )


    if (
        !bulanEl ||
        !tahunEl
    ) {

        return

    }


    const bulan =
        parseInt(
            bulanEl.value
        )


    const tahun =
        parseInt(
            tahunEl.value
        )


    const kelurahan =
        document.getElementById(
            "filterKelurahan"
        )?.value || ""


    currentFilter.bulan =
        bulan

    currentFilter.tahun =
        tahun

    currentFilter.kelurahan =
        kelurahan


    const bulanString =
        `${tahun}-${String(
            bulan
        ).padStart(2, "0")}`


    try {

        const rekap =
            await getRekapBulanan(
                bulanString
            )


        let users =
            rekap.data


        if (kelurahan) {

            users =
                users.filter(
                    user =>
                        user.kelurahan ===
                        kelurahan
                )

        }


        users.sort(
            (a, b) => {

                const koordA =
                    a.role ===
                    "koordinator"
                        ? 1
                        : 0


                const koordB =
                    b.role ===
                    "koordinator"
                        ? 1
                        : 0


                if (
                    koordA !==
                    koordB
                ) {

                    return (
                        koordB -
                        koordA
                    )

                }


                const kelA =
                    String(
                        a.kelurahan ||
                        ""
                    ).toUpperCase()


                const kelB =
                    String(
                        b.kelurahan ||
                        ""
                    ).toUpperCase()


                if (
                    kelA <
                    kelB
                ) {

                    return -1

                }


                if (
                    kelA >
                    kelB
                ) {

                    return 1

                }


                return String(
                    a.nama || ""
                ).localeCompare(
                    String(
                        b.nama || ""
                    )
                )

            }
        )


        const display =
            document.getElementById(
                "bulanDisplay"
            )


        if (display) {

            display.textContent =
                formatBulan(
                    bulan,
                    tahun
                )

        }


        renderTabelBulanan(
            users,
            tahun,
            bulan
        )


        renderStatBulanan(
            users,
            tahun,
            bulan
        )


        renderGrafikBulanan(
            users,
            tahun,
            bulan
        )


    } catch (error) {

        console.error(
            "Rekap bulanan:",
            error
        )

        showError(
            "Gagal memuat rekap bulanan: " +
            error.message
        )

    }

}


// =====================================================
// TABEL BULANAN
// =====================================================

function renderTabelBulanan(
    users,
    tahun,
    bulan
) {

    const header =
        document.getElementById(
            "headerBulanan"
        )


    const table =
        document.getElementById(
            "tableBulanan"
        )


    if (
        !header ||
        !table
    ) {

        return

    }


    const days =
        new Date(
            tahun,
            bulan,
            0
        ).getDate()


    let headerHtml =
        `
            <th>No</th>
            <th>Nama Fasilitator</th>
            <th>Kelurahan</th>
        `


    for (
        let d = 1;
        d <= days;
        d++
    ) {

        const day =
            new Date(
                tahun,
                bulan - 1,
                d
            ).getDay()


        const weekend =
            day === 0 ||
            day === 6


        headerHtml += `
            <th style="
                background:${
                    weekend
                        ? "#E74C3C"
                        : "#34495E"
                };
                color:white;
                min-width:35px;
                text-align:center;
            ">
                ${d}
            </th>
        `

    }


    headerHtml += `
        <th>Hadir</th>
        <th>Kerja</th>
        <th>%</th>
    `


    header.innerHTML =
        headerHtml


    let html = ""


    const totalKerja =
        hitungHariKerja(
            tahun,
            bulan
        )


    users.forEach(
        (user, index) => {

            let hadir = 0

            let cells = ""


            for (
                let d = 1;
                d <= days;
                d++
            ) {

                const tanggal =
                    `${tahun}-${String(
                        bulan
                    ).padStart(2, "0")}-${String(
                        d
                    ).padStart(2, "0")}`


                const day =
                    new Date(
                        tahun,
                        bulan - 1,
                        d
                    ).getDay()


                if (
                    day === 0 ||
                    day === 6
                ) {

                    cells += `
                        <td style="
                            background:#FADBD8;
                            color:#C0392B;
                            text-align:center;
                            font-weight:bold;
                        ">
                            L
                        </td>
                    `

                    continue

                }


                const detail =
                    user.detail?.find(
                        item =>
                            item.tanggal ===
                            tanggal
                    )


                if (detail) {

                    hadir++


                    cells += `
                        <td style="
                            background:#D4EFDF;
                            color:#27AE60;
                            text-align:center;
                        ">
                            <b>H</b>
                            <div style="
                                font-size:9px;
                            ">
                                ${formatDetailWaktu(
                                    detail.waktu
                                )}
                            </div>
                        </td>
                    `

                } else {

                    cells += `
                        <td style="
                            background:#FCF3CF;
                            color:#D35400;
                            text-align:center;
                        ">
                            -
                        </td>
                    `

                }

            }


            const persen =
                totalKerja > 0
                    ? Math.round(
                        (
                            hadir /
                            totalKerja
                        ) * 100
                    )
                    : 0


            const badge =
                user.role ===
                "koordinator"
                    ? `
                        <span style="
                            background:#F39C12;
                            color:white;
                            padding:2px 4px;
                            border-radius:10px;
                            font-size:9px;
                        ">
                            K
                        </span>
                    `
                    : ""


            html += `
                <tr>

                    <td>
                        ${index + 1}
                    </td>

                    <td>
                        ${user.nama || "-"}
                        ${badge}
                    </td>

                    <td>
                        ${user.kelurahan || "-"}
                    </td>

                    ${cells}

                    <td style="
                        text-align:center;
                        font-weight:bold;
                    ">
                        ${hadir}
                    </td>

                    <td style="
                        text-align:center;
                    ">
                        ${totalKerja}
                    </td>

                    <td style="
                        text-align:center;
                        font-weight:bold;
                    ">
                        ${persen}%
                    </td>

                </tr>
            `

        }
    )


    table.innerHTML =
        html ||
        `
            <tr>
                <td colspan="${
                    days + 6
                }"
                    style="
                        text-align:center;
                        padding:15px;
                    "
                >
                    Tidak ada data
                </td>
            </tr>
        `

}


// =====================================================
// STATISTIK BULANAN
// =====================================================

function renderStatBulanan(
    users,
    tahun,
    bulan
) {

    const hariKerja =
        hitungHariKerja(
            tahun,
            bulan
        )


    let totalHadir = 0


    users.forEach(
        user => {

            totalHadir +=
                user.hadir || 0

        }
    )


    const totalUser =
        users.length


    const rata =
        totalUser > 0
            ? (
                totalHadir /
                totalUser
            ).toFixed(1)
            : "0"


    const persen =
        hariKerja > 0
            ? Math.round(
                (
                    rata /
                    hariKerja
                ) * 100
            )
            : 0


    const totalHariEl =
        document.getElementById(
            "totalHari"
        )


    if (totalHariEl) {

        totalHariEl.textContent =
            hariKerja +
            " Hari"

    }


    const rataEl =
        document.getElementById(
            "rataHadir"
        )


    if (rataEl) {

        rataEl.textContent =
            rata +
            " Hari"

    }


    const persenEl =
        document.getElementById(
            "persenBulanan"
        )


    if (persenEl) {

        persenEl.textContent =
            persen +
            "%"

    }

}


// =====================================================
// GRAFIK
// =====================================================

function renderGrafikBulanan(
    users,
    tahun,
    bulan
) {

    const container =
        document.getElementById(
            "grafikContainer"
        )


    if (!container) {
        return
    }


    container.innerHTML = ""


    const hariKerja =
        hitungHariKerja(
            tahun,
            bulan
        )


    const grafik =
        [...users]
        .map(user => ({

            nama:
                user.nama ||
                "-",

            totalHadir:
                user.hadir || 0,

            persentase:
                hariKerja > 0
                    ? (
                        (
                            user.hadir || 0
                        ) /
                        hariKerja
                    ) * 100
                    : 0

        }))
        .sort(
            (a, b) =>
                a.totalHadir -
                b.totalHadir
        )
        .slice(0, 10)


    grafik.forEach(
        user => {

            const bar =
                document.createElement(
                    "div"
                )


            bar.style.cssText =
                `
                    flex:1;
                    display:flex;
                    flex-direction:column;
                    align-items:center;
                    gap:5px;
                `


            const height =
                Math.min(
                    user.persentase,
                    100
                )


            bar.innerHTML = `
                <div style="
                    height:150px;
                    width:100%;
                    display:flex;
                    align-items:flex-end;
                ">

                    <div style="
                        height:${height}%;
                        width:100%;
                        background:${
                            user.persentase >= 75
                                ? "#27AE60"
                                : user.persentase >= 50
                                    ? "#F39C12"
                                    : "#E74C3C"
                        };
                        border-radius:5px 5px 0 0;
                    "></div>

                </div>

                <div style="
                    font-size:10px;
                    text-align:center;
                    max-width:80px;
                    overflow:hidden;
                    white-space:nowrap;
                    text-overflow:ellipsis;
                ">
                    ${
                        user.nama
                            .split(" ")[0]
                    }
                </div>
            `


            container.appendChild(
                bar
            )

        }
    )

}


// =====================================================
// REKAP HARIAN
// =====================================================

async function loadRekapHarian() {

    const tanggalEl =
        document.getElementById(
            "filterTanggal"
        )


    /*
     * Kalau HTML lama belum punya
     * filterTanggal, otomatis gunakan
     * tanggal hari ini.
     */

    const tanggal =
        tanggalEl?.value ||
        new Date()
            .toISOString()
            .split("T")[0]


    currentFilter.tanggal =
        tanggal


    try {

        const rekap =
            await getRekapHarian(
                tanggal
            )


        let data =
            rekap.data


        const kelurahan =
            document.getElementById(
                "filterKelurahan"
            )?.value || ""


        if (kelurahan) {

            data =
                data.filter(
                    item =>
                        item.kelurahan ===
                        kelurahan
                )

        }


        renderTabelHarian(
            data
        )


        renderStatHarian(
            data
        )


    } catch (error) {

        console.error(
            "Rekap harian:",
            error
        )

        showError(
            "Gagal memuat rekap harian: " +
            error.message
        )

    }

}


// =====================================================
// TABEL HARIAN
// =====================================================

function renderTabelHarian(
    data
) {

    const table =
        document.getElementById(
            "tableHarian"
        )


    if (!table) {
        return
    }


    let html = ""


    data.forEach(
        (item, index) => {

            const status =
                String(
                    item.status ||
                    "-"
                )


            const statusLower =
                status.toLowerCase()


            let statusStyle =
                ""


            if (
                statusLower ===
                "hadir"
            ) {

                statusStyle =
                    `
                        color:#27AE60;
                        font-weight:bold;
                    `

            } else if (
                statusLower ===
                "izin"
            ) {

                statusStyle =
                    `
                        color:#F39C12;
                        font-weight:bold;
                    `

            } else if (
                statusLower ===
                "sakit"
            ) {

                statusStyle =
                    `
                        color:#3498DB;
                        font-weight:bold;
                    `

            }


            html += `
                <tr>

                    <td>
                        ${index + 1}
                    </td>

                    <td>
                        ${item.nama || "-"}
                    </td>

                    <td>
                        ${item.email || "-"}
                    </td>

                    <td>
                        ${item.kelurahan || "-"}
                    </td>

                    <td style="${statusStyle}">
                        ${status}
                    </td>

                    <td>
                        ${item.waktu || "-"}
                    </td>

                    <td>
                        ${item.lokasi || "-"}
                    </td>

                </tr>
            `

        }
    )


    table.innerHTML =
        html ||
        `
            <tr>
                <td colspan="7"
                    style="
                        text-align:center;
                        padding:15px;
                    "
                >
                    Tidak ada data
                </td>
            </tr>
        `

}


// =====================================================
// STAT HARIAN
// =====================================================

function renderStatHarian(
    data
) {

    let hadir = 0
    let terlambat = 0
    let izin = 0
    let sakit = 0


    data.forEach(
        item => {

            const status =
                String(
                    item.status ||
                    "hadir"
                ).toLowerCase()


            if (
                status === "hadir"
            ) {

                hadir++

            } else if (
                status ===
                    "terlambat" ||
                status === "telat"
            ) {

                terlambat++

            } else if (
                status === "izin"
            ) {

                izin++

            } else if (
                status === "sakit"
            ) {

                sakit++

            }

        }
    )


    /*
     * Kalau HTML mempunyai card
     * dengan ID berikut, otomatis
     * akan diisi.
     */

    const totalEl =
        document.getElementById(
            "totalPresensiHarian"
        )


    if (totalEl) {

        totalEl.textContent =
            data.length

    }


    const hadirEl =
        document.getElementById(
            "totalHadirHarian"
        )


    if (hadirEl) {

        hadirEl.textContent =
            hadir

    }


    const terlambatEl =
        document.getElementById(
            "totalTerlambatHarian"
        )


    if (terlambatEl) {

        terlambatEl.textContent =
            terlambat

    }


    const izinEl =
        document.getElementById(
            "totalIzinHarian"
        )


    if (izinEl) {

        izinEl.textContent =
            izin

    }


    const sakitEl =
        document.getElementById(
            "totalSakitHarian"
        )


    if (sakitEl) {

        sakitEl.textContent =
            sakit

    }

}


// =====================================================
// APPLY FILTER
// =====================================================

window.applyFilter =
    async function () {

        showLoading(true)


        try {

            await loadRekapBulanan()

            await loadRekapHarian()

        } catch (error) {

            showError(
                error.message
            )

        } finally {

            showLoading(false)

        }

    }


// =====================================================
// RESET FILTER
// =====================================================

window.resetFilter =
    async function () {

        const sekarang =
            new Date()


        const bulan =
            document.getElementById(
                "filterBulan"
            )


        const tahun =
            document.getElementById(
                "filterTahun"
            )


        const kelurahan =
            document.getElementById(
                "filterKelurahan"
            )


        const tanggal =
            document.getElementById(
                "filterTanggal"
            )


        if (bulan) {

            bulan.value =
                sekarang.getMonth() + 1

        }


        if (tahun) {

            tahun.value =
                sekarang.getFullYear()

        }


        if (kelurahan) {

            kelurahan.value =
                ""

        }


        if (tanggal) {

            tanggal.value =
                sekarang
                    .toISOString()
                    .split("T")[0]

        }


        await loadRekapBulanan()

        await loadRekapHarian()

    }


// =====================================================
// EXPORT BULANAN
// =====================================================

window.exportBulanan =
    async function () {

        showLoading(true)


        try {

            const bulan =
                parseInt(
                    document.getElementById(
                        "filterBulan"
                    )?.value
                )


            const tahun =
                parseInt(
                    document.getElementById(
                        "filterTahun"
                    )?.value
                )


            const kelurahan =
                document.getElementById(
                    "filterKelurahan"
                )?.value || ""


            const bulanString =
                `${tahun}-${String(
                    bulan
                ).padStart(2, "0")}`


            const rekap =
                await getRekapBulanan(
                    bulanString
                )


            let data =
                rekap.data


            if (kelurahan) {

                data =
                    data.filter(
                        item =>
                            item.kelurahan ===
                            kelurahan
                    )

            }


            const days =
                new Date(
                    tahun,
                    bulan,
                    0
                ).getDate()


            const header = [

                "No",

                "Nama",

                "Role",

                "Kelurahan",

                "Hadir",

                "Terlambat",

                "Izin",

                "Sakit",

                "Alpha",

                "Total Presensi"

            ]


            for (
                let d = 1;
                d <= days;
                d++
            ) {

                header.push(
                    String(d)
                )

            }


            const excelData =
                [header]


            data.forEach(
                (user, index) => {

                    const row = [

                        index + 1,

                        user.nama || "-",

                        user.role ===
                            "koordinator"
                            ? "Koordinator"
                            : "Fasilitator",

                        user.kelurahan || "-",

                        user.hadir || 0,

                        user.terlambat || 0,

                        user.izin || 0,

                        user.sakit || 0,

                        user.alpha || 0,

                        user.totalPresensi || 0

                    ]


                    for (
                        let d = 1;
                        d <= days;
                        d++
                    ) {

                        const tanggal =
                            `${bulanString}-${String(
                                d
                            ).padStart(
                                2,
                                "0"
                            )}`


                        const day =
                            new Date(
                                tahun,
                                bulan - 1,
                                d
                            ).getDay()


                        if (
                            day === 0 ||
                            day === 6
                        ) {

                            row.push(
                                "L"
                            )

                        } else {

                            const detail =
                                user.detail?.find(
                                    item =>
                                        item.tanggal ===
                                        tanggal
                                )


                            row.push(
                                detail
                                    ? formatDetailWaktu(
                                        detail.waktu
                                    )
                                    : "-"
                            )

                        }

                    }


                    excelData.push(
                        row
                    )

                }
            )


            const wb =
                XLSX.utils.book_new()


            const ws =
                XLSX.utils.aoa_to_sheet(
                    excelData
                )


            XLSX.utils.book_append_sheet(
                wb,
                ws,
                "Rekap Bulanan"
            )


            const namaBulan = [

                "Januari",
                "Februari",
                "Maret",
                "April",
                "Mei",
                "Juni",
                "Juli",
                "Agustus",
                "September",
                "Oktober",
                "November",
                "Desember"

            ]


            const fileName =
                kelurahan
                    ? `Rekap_Pemantauan_${kelurahan}_${namaBulan[bulan - 1]}_${tahun}.xlsx`
                    : `Rekap_Pemantauan_${namaBulan[bulan - 1]}_${tahun}.xlsx`


            XLSX.writeFile(
                wb,
                fileName
            )


        } catch (error) {

            console.error(
                "Export bulanan:",
                error
            )

            alert(
                "Gagal export: " +
                error.message
            )

        } finally {

            showLoading(false)

        }

    }


// =====================================================
// EXPORT HARIAN
// =====================================================

window.exportHarian =
    async function () {

        const tanggal =
            document.getElementById(
                "filterTanggal"
            )?.value ||
            new Date()
                .toISOString()
                .split("T")[0]


        showLoading(true)


        try {

            const rekap =
                await getRekapHarian(
                    tanggal
                )


            let data =
                rekap.data


            const kelurahan =
                document.getElementById(
                    "filterKelurahan"
                )?.value || ""


            if (kelurahan) {

                data =
                    data.filter(
                        item =>
                            item.kelurahan ===
                            kelurahan
                    )

            }


            const excelData = [

                [
                    "No",
                    "Nama",
                    "Email",
                    "Kelurahan",
                    "Role",
                    "Status",
                    "Waktu",
                    "Lokasi"
                ]

            ]


            data.forEach(
                (item, index) => {

                    excelData.push([

                        index + 1,

                        item.nama || "-",

                        item.email || "-",

                        item.kelurahan || "-",

                        item.role || "-",

                        item.status || "-",

                        item.waktu || "-",

                        item.lokasi || "-"

                    ])

                }
            )


            const wb =
                XLSX.utils.book_new()


            const ws =
                XLSX.utils.aoa_to_sheet(
                    excelData
                )


            XLSX.utils.book_append_sheet(
                wb,
                ws,
                "Rekap Harian"
            )


            XLSX.writeFile(
                wb,
                `Rekap_Pemantauan_${tanggal}.xlsx`
            )


        } catch (error) {

            console.error(
                "Export harian:",
                error
            )

            alert(
                "Gagal export: " +
                error.message
            )

        } finally {

            showLoading(false)

        }

    }


// =====================================================
// HELPER HARI KERJA
// =====================================================

function hitungHariKerja(
    tahun,
    bulan
) {

    const days =
        new Date(
            tahun,
            bulan,
            0
        ).getDate()


    let total = 0


    for (
        let d = 1;
        d <= days;
        d++
    ) {

        const day =
            new Date(
                tahun,
                bulan - 1,
                d
            ).getDay()


        if (
            day !== 0 &&
            day !== 6
        ) {

            total++

        }

    }


    return total

}


// =====================================================
// FORMAT DETAIL WAKTU
// =====================================================

function formatDetailWaktu(
    waktu
) {

    if (!waktu) {
        return "-"
    }


    /*
     * Jika sudah berupa jam,
     * jangan diproses lagi.
     */

    if (
        typeof waktu === "string" &&
        /^\d{1,2}:\d{2}/.test(
            waktu
        )
    ) {

        return waktu.substring(
            0,
            5
        )

    }


    return String(waktu)

}


// =====================================================
// CEK STATUS LOKASI
// =====================================================

async function cekStatusLokasiAktif() {

    const notifEl =
        document.getElementById(
            "notifikasiStatusLokasi"
        )


    if (!notifEl) {
        return
    }


    try {

        const docSnap =
            await getDoc(
                doc(
                    db,
                    "system_settings",
                    "global"
                )
            )


        if (!docSnap.exists()) {
            return
        }


        const data =
            docSnap.data()


        const now =
            new Date()


        const start =
            data.temporaryStart
                ? new Date(
                    data.temporaryStart
                )
                : null


        const end =
            data.temporaryEnd
                ? new Date(
                    data.temporaryEnd
                )
                : null


        const isCustomActive =

            data.statusLokasi ===
                "custom" &&

            data.temporaryLocationEnabled &&

            start &&
            end &&

            now >= start &&
            now <= end


        notifEl.style.display =
            "block"


        if (isCustomActive) {

            notifEl.innerHTML = `

                <div style="
                    background-color:#F5EEF8;
                    color:#6C3483;
                    border:1px solid #D7BDE2;
                    padding:12px 15px;
                    border-radius:8px;
                    font-size:13px;
                    font-weight:500;
                    display:flex;
                    align-items:center;
                    gap:10px;
                    margin-bottom:15px;
                ">

                    <span>
                        🟣
                    </span>

                    <span>

                        <strong>
                            Status Wilayah:
                        </strong>

                        <strong>
                            Lokasi Custom
                        </strong>

                        aktif,
                        radius
                        ${data.temporaryRadius || "-"}m.

                    </span>

                </div>

            `

        } else {

            notifEl.innerHTML = `

                <div style="
                    background-color:#E8F8F5;
                    color:#117864;
                    border:1px solid #A3E4D7;
                    padding:12px 15px;
                    border-radius:8px;
                    font-size:13px;
                    font-weight:500;
                    display:flex;
                    align-items:center;
                    gap:10px;
                    margin-bottom:15px;
                ">

                    <span>
                        🟢
                    </span>

                    <span>

                        <strong>
                            Status Wilayah:
                        </strong>

                        Normal -
                        <strong>
                            Lokasi Default
                        </strong>
                        digunakan.

                    </span>

                </div>

            `

        }

    } catch (error) {

        console.error(
            "Gagal cek status lokasi:",
            error
        )

    }

}


// =====================================================
// FUNGSI TAMBAHAN: REFRESH
// =====================================================

window.refreshDashboard =
    async function () {

        showLoading(true)

        try {

            await loadData()

            await loadFilterOptions()

            await loadRekapBulanan()

            await loadRekapHarian()

            await cekStatusLokasiAktif()

        } catch (error) {

            showError(
                error.message
            )

        } finally {

            showLoading(false)

        }

    }


console.log(
    "pemantau.js siap - harian + bulanan"
)
