import {
    getExportHarian,
    getExportBulanan
} from "./rekap.js"


export async function exportToExcel(tanggal) {

    try {

        const data =
            await getExportHarian(tanggal)


        const wb =
            XLSX.utils.book_new()


        const ws =
            XLSX.utils.aoa_to_sheet(data)


        XLSX.utils.book_append_sheet(
            wb,
            ws,
            `Presensi ${tanggal}`
        )


        XLSX.writeFile(
            wb,
            `rekap_presensi_${tanggal}.xlsx`
        )

    }

    catch (error) {

        console.error(
            "Error export harian:",
            error
        )

        throw error

    }

}


// =====================================================
// EXPORT BULANAN
// =====================================================

export async function exportBulananToExcel(
    bulan
) {

    try {

        const data =
            await getExportBulanan(bulan)


        const wb =
            XLSX.utils.book_new()


        const ws =
            XLSX.utils.aoa_to_sheet(data)


        XLSX.utils.book_append_sheet(
            wb,
            ws,
            `Rekap ${bulan}`
        )


        XLSX.writeFile(
            wb,
            `rekap_bulanan_${bulan}.xlsx`
        )

    }

    catch (error) {

        console.error(
            "Error export bulanan:",
            error
        )

        throw error

    }

}
