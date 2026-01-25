# ============================================
# FULL E-OFFICE API TESTING SCRIPT
# ============================================
$baseUrl = "http://localhost:3079/api"
$sigUrl = "data:image/png;base64,iVBORw0KGgo="

# Helper function
function Write-Test($step, $msg) { Write-Host "[$step] $msg" -ForegroundColor Cyan }
function Write-Success($msg) { Write-Host "   OK: $msg" -ForegroundColor Green }
function Write-Error($msg) { Write-Host "   ERR: $msg" -ForegroundColor Red }

# ============================================
# 1. Health Check
# ============================================
Write-Test "1" "Health Check"
try {
    $health = Invoke-RestMethod -Uri "$baseUrl/health"
    Write-Success "Status: $($health.status) (v$($health.version))"
} catch { Write-Error $_.Exception.Message }

# ============================================
# 2. Mahasiswa Login + Submit
# ============================================
Write-Test "2" "Mahasiswa Login"
$mhs = New-Object Microsoft.PowerShell.Commands.WebRequestSession
try {
    $login = Invoke-RestMethod -Uri "$baseUrl/auth/sign-in/email" -Method POST `
        -ContentType "application/json" `
        -Body '{"email":"ahmad.budi@students.undip.ac.id","password":"password1234"}' `
        -WebSession $mhs
    Write-Success "Logged in as: $($login.user.name)"
} catch { Write-Error $_.Exception.Message }

Write-Test "3" "Get Letter Types"
$types = Invoke-RestMethod -Uri "$baseUrl/submission/letter-types" -WebSession $mhs
$stTypeId = ($types.data | Where-Object { $_.code -eq "ST" }).id
Write-Success "ST Type ID: $stTypeId"

Write-Test "4" "Submit New Letter"
$body = @{
    letterTypeId = $stTypeId
    formData = @{
        nama = "Ahmad Budi"
        nim = "24060121130001"
        programStudi = "S1 Informatika"
        departemen = "Informatika"
        noHp = "08123456789"
        email = "ahmad.budi@students.undip.ac.id"
        jenisSurat = "SURAT_TUGAS"
        keperluan = "Mengikuti Seminar AI Indonesia 2026"
        judulAcara = "Seminar AI 2026"
        tanggalAcara = "2026-03-15"
        lokasiAcara = "Jakarta"
        butuhTtdKadep = $true
    }
    signatureConfig = @{
        targetSigner = "DEKAN"
        requestKadepSign = $true
    }
} | ConvertTo-Json -Depth 3

try {
    $submit = Invoke-RestMethod -Uri "$baseUrl/submission" -Method POST `
        -ContentType "application/json" -Body $body -WebSession $mhs
    $letterId = $submit.data.id
    if (-not $letterId) { $letterId = $submit.data.letter.id }
    Write-Success "ID: $letterId, Status: $($submit.data.status)"
} catch { Write-Error $_.Exception.Message; exit }

# ============================================
# 5. KAPRODI Approve
# ============================================
Write-Test "5" "KAPRODI Approve"
$kap = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$null = Invoke-RestMethod -Uri "$baseUrl/auth/sign-in/email" -Method POST `
    -ContentType "application/json" `
    -Body '{"email":"kaprodi.if@undip.ac.id","password":"password1234"}' `
    -WebSession $kap
try {
    $approve = Invoke-RestMethod -Uri "$baseUrl/department-approval/$letterId/approve" `
        -Method POST -ContentType "application/json" -Body '{"notes":"Approved"}' -WebSession $kap
    Write-Success "$($approve.message), Status: $($approve.data.letter.status)"
} catch { Write-Error $_.Exception.Message }

# ============================================
# 6. Admin Prodi Draft + Submit
# ============================================
Write-Test "6" "Admin Prodi Draft"
$adp = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$null = Invoke-RestMethod -Uri "$baseUrl/auth/sign-in/email" -Method POST `
    -ContentType "application/json" `
    -Body '{"email":"admin.prodi.if@undip.ac.id","password":"password1234"}' `
    -WebSession $adp

$draftBody = @{
    content = @{
        perihal = "Surat Pengantar"
        ditujukan = "Yth. Panitia Seminar"
        isi = "Mahasiswa Ahmad Budi ditugaskan mengikuti Seminar AI 2026"
    }
    signatories = @(
        @{ signerRole = "KAPRODI"; signerName = "Prof. Aris Sugiharto"; signerNip = "197608152005011001"; order = 1 }
        @{ signerRole = "KADEP"; signerName = "Prof. Kusworo Adi"; signerNip = "196710051994031001"; order = 2 }
    )
    tembusan = @("Arsip")
} | ConvertTo-Json -Depth 3

try {
    $draft = Invoke-RestMethod -Uri "$baseUrl/department-approval/$letterId/draft" `
        -Method POST -ContentType "application/json" -Body $draftBody -WebSession $adp
    Write-Success "$($draft.message)"
    
    $submitDraft = Invoke-RestMethod -Uri "$baseUrl/department-approval/$letterId/submit-draft" `
        -Method POST -ContentType "application/json" -Body '{}' -WebSession $adp
    Write-Success "Submit Draft: $($submitDraft.message), Status: $($submitDraft.data.letter.status)"
} catch { Write-Error $_.Exception.Message }

# ============================================
# 7. KAPRODI Sign
# ============================================
Write-Test "7" "KAPRODI Sign Surat Pengantar"
try {
    $signBody = @{signatureUrl=$sigUrl;signerName="Prof. Aris Sugiharto";signerNip="197608152005011001"} | ConvertTo-Json
    $sign = Invoke-RestMethod -Uri "$baseUrl/department-approval/$letterId/sign" `
        -Method POST -ContentType "application/json" -Body $signBody -WebSession $kap
    Write-Success "$($sign.message)"
} catch { Write-Error $_.Exception.Message }

# Check status
$status = Invoke-RestMethod -Uri "$baseUrl/department-approval/$letterId" -WebSession $kap
Write-Success "After KAPRODI sign: Status=$($status.data.letter.status), ActiveRole=$($status.data.letter.currentActiveRole)"

# ============================================
# 8. KADEP Sign (if requestKadepSign=true)
# ============================================
Write-Test "8" "KADEP Sign Surat Pengantar"
$kde = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$null = Invoke-RestMethod -Uri "$baseUrl/auth/sign-in/email" -Method POST `
    -ContentType "application/json" `
    -Body '{"email":"kadep.if@undip.ac.id","password":"password1234"}' `
    -WebSession $kde
try {
    $signBody = @{signatureUrl=$sigUrl;signerName="Prof. Kusworo Adi";signerNip="196710051994031001"} | ConvertTo-Json
    $sign = Invoke-RestMethod -Uri "$baseUrl/department-approval/$letterId/sign" `
        -Method POST -ContentType "application/json" -Body $signBody -WebSession $kde
    Write-Success "$($sign.message)"
} catch { Write-Error $_.Exception.Message }

# ============================================
# 9. Admin Fakultas Categorize + Forward to DEKAN
# ============================================
Write-Test "9" "Admin Fakultas Categorize"
$adf = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$null = Invoke-RestMethod -Uri "$baseUrl/auth/sign-in/email" -Method POST `
    -ContentType "application/json" `
    -Body '{"email":"admin.fakultas@fsm.undip.ac.id","password":"password1234"}' `
    -WebSession $adf
try {
    $cat = Invoke-RestMethod -Uri "$baseUrl/faculty-disposition/$letterId/categorize" `
        -Method POST -ContentType "application/json" -Body '{"category":"UMUM","notes":"Diteruskan"}' -WebSession $adf
    Write-Success "$($cat.message)"
    
    Write-Test "10" "Admin Fakultas Forward to DEKAN (testing fix!)"
    $fwd = Invoke-RestMethod -Uri "$baseUrl/faculty-disposition/$letterId/forward" `
        -Method POST -ContentType "application/json" -Body '{"targetRole":"DEKAN","notes":"Untuk disposisi Bapak Dekan"}' -WebSession $adf
    Write-Success "$($fwd.message)"
} catch { Write-Error $_.Exception.Message }

# ============================================
# 11. DEKAN Disposition to WADEK_1
# ============================================
Write-Test "11" "DEKAN Disposition to WADEK_1"
$dek = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$null = Invoke-RestMethod -Uri "$baseUrl/auth/sign-in/email" -Method POST `
    -ContentType "application/json" `
    -Body '{"email":"dekan@fsm.undip.ac.id","password":"password1234"}' `
    -WebSession $dek
try {
    $disp = Invoke-RestMethod -Uri "$baseUrl/faculty-disposition/$letterId/forward" `
        -Method POST -ContentType "application/json" -Body '{"targetRole":"WADEK_1","notes":"Tindaklanjuti"}' -WebSession $dek
    Write-Success "$($disp.message)"
} catch { Write-Error $_.Exception.Message }

# ============================================
# 12. WADEK_1 Disposition to STAF_AKADEMIK (for drafting)
# ============================================
Write-Test "12" "WADEK_1 Disposition to STAF_AKADEMIK"
$wdk = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$null = Invoke-RestMethod -Uri "$baseUrl/auth/sign-in/email" -Method POST `
    -ContentType "application/json" `
    -Body '{"email":"wadek1@fsm.undip.ac.id","password":"password1234"}' `
    -WebSession $wdk
try {
    $disp = Invoke-RestMethod -Uri "$baseUrl/faculty-disposition/$letterId/forward" `
        -Method POST -ContentType "application/json" -Body '{"targetRole":"STAF_AKADEMIK","notes":"Buatkan draft ST"}' -WebSession $wdk
    Write-Success "$($disp.message)"
} catch { Write-Error $_.Exception.Message }

# ============================================
# 13. Staf Akademik Create Draft ST
# ============================================
Write-Test "13" "Staf Akademik Create Draft ST"
$stf = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$null = Invoke-RestMethod -Uri "$baseUrl/auth/sign-in/email" -Method POST `
    -ContentType "application/json" `
    -Body '{"email":"staf.akademik1@fsm.undip.ac.id","password":"password1234"}' `
    -WebSession $stf

$stBody = @{
    documentType = "SURAT_TUGAS"
    content = @{
        nomor = "___/UN7.3.3/HK.04.01/2026"
        perihal = "Surat Tugas Mengikuti Seminar"
        dasar = "Surat Dekan Fakultas Sains dan Matematika No. XXX"
        isi = "Memberikan tugas kepada Ahmad Budi untuk mengikuti Seminar AI Indonesia 2026"
    }
    perihal = "Surat Tugas Seminar AI"
    tembusan = @("Arsip", "Yang bersangkutan")
    signatories = @(
        @{ signerRole = "DEKAN"; signerName = "Prof. Dr. Muhammad Nur, M.Si"; signerNip = "196311031988031001"; order = 1 }
    )
} | ConvertTo-Json -Depth 3

try {
    $draftST = Invoke-RestMethod -Uri "$baseUrl/surat-hasil/$letterId/draft" `
        -Method POST -ContentType "application/json" -Body $stBody -WebSession $stf
    Write-Success "$($draftST.message)"
    
    Write-Test "14" "Staf Submit for Verification"
    $subVer = Invoke-RestMethod -Uri "$baseUrl/surat-hasil/$letterId/submit" `
        -Method POST -ContentType "application/json" -Body '{}' -WebSession $stf
    Write-Success "$($subVer.message)"
} catch { Write-Error $_.Exception.Message }

# ============================================
# 15. Supervisor Akademik Options Test
# ============================================
Write-Test "15" "Supervisor Akademik - 3 Options Test"
$spv = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$null = Invoke-RestMethod -Uri "$baseUrl/auth/sign-in/email" -Method POST `
    -ContentType "application/json" `
    -Body '{"email":"spv.akademik@fsm.undip.ac.id","password":"password1234"}' `
    -WebSession $spv

# Check permissions
$detail = Invoke-RestMethod -Uri "$baseUrl/surat-hasil/$letterId" -WebSession $spv
Write-Success "Status: $($detail.data.letter.status), ActiveRole: $($detail.data.letter.currentActiveRole)"
Write-Success "Permissions: canApprove=$($detail.data.permissions.canApproveVerification), canEdit=$($detail.data.permissions.canUpdateDraftAsSupervisor), canReturn=$($detail.data.permissions.canReturnForRevision)"

# Test Option 1: Approve (goes to MANAJER_TU)
try {
    $approve = Invoke-RestMethod -Uri "$baseUrl/surat-hasil/$letterId/approve" `
        -Method POST -ContentType "application/json" -Body '{"notes":"Verified by Supervisor"}' -WebSession $spv
    Write-Success "Option 1 - Approve: $($approve.message)"
} catch { Write-Error $_.Exception.Message }

# ============================================
# 16. Manajer TU Approve (goes to SIGNING)
# ============================================
Write-Test "16" "Manajer TU Approve"
$mtu = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$null = Invoke-RestMethod -Uri "$baseUrl/auth/sign-in/email" -Method POST `
    -ContentType "application/json" `
    -Body '{"email":"manajer.tu@fsm.undip.ac.id","password":"password1234"}' `
    -WebSession $mtu

try {
    $approve = Invoke-RestMethod -Uri "$baseUrl/surat-hasil/$letterId/approve" `
        -Method POST -ContentType "application/json" -Body '{"notes":"Verified by Manajer TU"}' -WebSession $mtu
    Write-Success "$($approve.message)"
} catch { Write-Error $_.Exception.Message }

# ============================================
# 17. DEKAN Sign ST
# ============================================
Write-Test "17" "DEKAN Sign ST (Final Signing)"
try {
    # Check current status first
    $detail = Invoke-RestMethod -Uri "$baseUrl/signing/result/$letterId" -WebSession $dek
    Write-Success "Before sign: Status=$($detail.data.letter.status)"
    
    $signBody = @{signatureUrl=$sigUrl;signerName="Prof. Dr. Muhammad Nur, M.Si";signerNip="196311031988031001"} | ConvertTo-Json
    $sign = Invoke-RestMethod -Uri "$baseUrl/signing/result/$letterId/sign" `
        -Method POST -ContentType "application/json" -Body $signBody -WebSession $dek
    Write-Success "$($sign.message)"
} catch { Write-Error $_.Exception.Message }

# ============================================
# Final Status Check
# ============================================
Write-Test "FINAL" "Status Check"
try {
    $final = Invoke-RestMethod -Uri "$baseUrl/submission/$letterId" -WebSession $mhs
    Write-Success "Final Status: $($final.data.letter.status), ActiveRole: $($final.data.letter.currentActiveRole)"
} catch { Write-Error $_.Exception.Message }

Write-Host ""
Write-Host "========================================"
Write-Host "TESTING COMPLETE!"
Write-Host "========================================"
