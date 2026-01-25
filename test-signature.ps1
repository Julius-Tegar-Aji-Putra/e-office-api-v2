# Test Signature & Signing Module
# Run: .\test-signature.ps1

$BASE_URL = "http://localhost:3079/api"

# Colors
function Write-Success { param($msg) Write-Host "[OK] $msg" -ForegroundColor Green }
function Write-Error { param($msg) Write-Host "[ERROR] $msg" -ForegroundColor Red }
function Write-Info { param($msg) Write-Host "[INFO] $msg" -ForegroundColor Cyan }

Write-Host "`n============================================" -ForegroundColor Yellow
Write-Host "  SIGNATURE & SIGNING MODULE TEST" -ForegroundColor Yellow
Write-Host "============================================`n" -ForegroundColor Yellow

# Test 1: Health check
Write-Info "Test 1: Health Check"
try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/../health" -Method GET
    if ($response.status -eq "ok") {
        Write-Success "Server is healthy"
    }
} catch {
    Write-Error "Health check failed: $_"
}

# Test 2: Get signatures without auth (should fail)
Write-Info "`nTest 2: Get Signatures Without Auth (should return 401)"
try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/signatures/me" -Method GET
    Write-Error "Should have failed but got: $($response | ConvertTo-Json)"
} catch {
    if ($_.Exception.Response.StatusCode -eq 401) {
        Write-Success "Correctly returned 401 Unauthorized"
    } else {
        Write-Error "Unexpected error: $_"
    }
}

# Test 3: Get pending signatures without auth (should fail)
Write-Info "`nTest 3: Get Pending Signatures Without Auth (should return 401)"
try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/signing/pending" -Method GET
    Write-Error "Should have failed but got: $($response | ConvertTo-Json)"
} catch {
    if ($_.Exception.Response.StatusCode -eq 401) {
        Write-Success "Correctly returned 401 Unauthorized"
    } else {
        Write-Error "Unexpected error: $_"
    }
}

Write-Host "`n============================================" -ForegroundColor Yellow
Write-Host "  TEST COMPLETED" -ForegroundColor Yellow
Write-Host "============================================`n" -ForegroundColor Yellow

Write-Info "Note: To test authenticated endpoints, you need a valid session token."
Write-Info "Available endpoints:"
Write-Info "  - GET  /api/signatures/me          - Get my saved signatures"
Write-Info "  - GET  /api/signatures/:id         - Get signature by ID"
Write-Info "  - POST /api/signatures/upload      - Upload new signature"
Write-Info "  - PATCH /api/signatures/:id        - Update signature alias"
Write-Info "  - DELETE /api/signatures/:id       - Delete signature"
Write-Info "  - GET  /api/signing/pending        - Get pending signatures for signing"
Write-Info "  - GET  /api/signing/:signatureId   - Get signature detail for signing"
Write-Info "  - POST /api/signing/sign           - Sign a document"
Write-Info "  - POST /api/signing/generate-draft - Generate HTML draft from template"
