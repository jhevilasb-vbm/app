"""VBM Gestão 3D - Backend regression tests (pytest)."""
import os
import time
import pytest
import requests

BASE = os.environ.get("EXPO_BACKEND_URL", "https://vbm-impressao3d.preview.emergentagent.com").rstrip("/") + "/api"
EMAIL1 = "jhevilasb@gmail.com"
EMAIL2 = "bh.nascimento@hotmail.com"
PWD = "Vbm3d@2026"


@pytest.fixture(scope="session")
def token():
    r = requests.post(f"{BASE}/auth/login", json={"email": EMAIL1, "password": PWD}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def H(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---------------- Auth
class TestAuth:
    def test_login_user1(self):
        r = requests.post(f"{BASE}/auth/login", json={"email": EMAIL1, "password": PWD})
        assert r.status_code == 200
        assert "token" in r.json() and r.json()["user"]["email"] == EMAIL1

    def test_login_user2(self):
        r = requests.post(f"{BASE}/auth/login", json={"email": EMAIL2, "password": PWD})
        assert r.status_code == 200

    def test_login_wrong_pwd(self):
        r = requests.post(f"{BASE}/auth/login", json={"email": EMAIL1, "password": "wrong"})
        assert r.status_code in (401, 429)

    def test_no_token_401(self):
        r = requests.get(f"{BASE}/dashboard")
        assert r.status_code == 401


# ---------------- Calculator
class TestCalc:
    def test_margin_mode(self, H):
        payload = {"weight_g": 100, "filament_cost_kg": 100, "print_minutes": 60, "qty": 2,
                   "marketplace_pct": 20, "margin_pct": 30, "kwh_cost": 1, "labor_hour": 0, "failure_pct": 0}
        r = requests.post(f"{BASE}/calc", headers=H, json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["unit_cost"] == 10.0
        # min_price with margin 30, taxes 20: 10/(1-0.5) = 20
        assert d["min_price"] == 20.0
        assert d["breakeven_price"] == 12.5
        assert isinstance(d["warnings"], list)
        assert isinstance(d["comparison"], list) and len(d["comparison"]) >= 1

    def test_markup_mode(self, H):
        payload = {"weight_g": 100, "filament_cost_kg": 100, "print_minutes": 60, "qty": 2,
                   "marketplace_pct": 20, "pricing_mode": "markup", "markup_pct": 50,
                   "kwh_cost": 1, "labor_hour": 0, "failure_pct": 0}
        r = requests.post(f"{BASE}/calc", headers=H, json=payload)
        assert r.status_code == 200
        d = r.json()
        # (10*1.5)/0.8 = 18.75
        assert d["min_price"] == 18.75


# ---------------- Generic CRUD
class TestCRUD:
    created = {}

    def test_create_client(self, H):
        r = requests.post(f"{BASE}/c/clients", headers=H, json={"name": "TEST_Cliente", "phone": "11999999999"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["name"] == "TEST_Cliente" and d["id"]
        TestCRUD.created["client_id"] = d["id"]
        # GET verify
        r2 = requests.get(f"{BASE}/c/clients/{d['id']}", headers=H)
        assert r2.status_code == 200 and r2.json()["name"] == "TEST_Cliente"

    def test_invalid_collection(self, H):
        r = requests.get(f"{BASE}/c/invalidcol", headers=H)
        assert r.status_code == 404

    def test_soft_delete_client(self, H):
        cid = TestCRUD.created["client_id"]
        r = requests.delete(f"{BASE}/c/clients/{cid}", headers=H)
        assert r.status_code == 200
        r2 = requests.get(f"{BASE}/c/clients/{cid}", headers=H)
        assert r2.status_code == 404


# ---------------- Stock
class TestStock:
    def test_material_create_with_qty_creates_entrada(self, H):
        r = requests.post(f"{BASE}/c/materials", headers=H,
                          json={"name": "TEST_PLA", "kind": "filamento", "unit": "g", "qty": 500, "unit_cost": 0.10})
        assert r.status_code == 200
        mid = r.json()["id"]
        # verify qty persisted and movement exists
        rm = requests.get(f"{BASE}/c/materials/{mid}", headers=H).json()
        assert float(rm["qty"]) == 500
        mv = requests.get(f"{BASE}/stock/movements?material_id={mid}", headers=H).json()
        assert any(m["type"] == "entrada" for m in mv)
        TestStock.mid = mid

    def test_saida_beyond_stock_409(self, H):
        mid = TestStock.mid
        r = requests.post(f"{BASE}/stock/movement", headers=H,
                          json={"material_id": mid, "type": "saida", "qty": 99999})
        assert r.status_code == 409

    def test_saida_force_true(self, H):
        mid = TestStock.mid
        r = requests.post(f"{BASE}/stock/movement", headers=H,
                          json={"material_id": mid, "type": "saida", "qty": 10, "force": False})
        assert r.status_code == 200

    def test_avg_cost_recalc_on_entrada(self, H):
        mid = TestStock.mid
        before = requests.get(f"{BASE}/c/materials/{mid}", headers=H).json()
        avg_before = float(before["avg_cost"])
        r = requests.post(f"{BASE}/stock/movement", headers=H,
                          json={"material_id": mid, "type": "entrada", "qty": 500, "unit_cost": 0.20})
        assert r.status_code == 200
        after = requests.get(f"{BASE}/c/materials/{mid}", headers=H).json()
        # avg should move up toward 0.20
        assert float(after["avg_cost"]) > avg_before


# ---------------- Quote -> Order
class TestQuoteOrder:
    def test_full_flow(self, H):
        # client
        c = requests.post(f"{BASE}/c/clients", headers=H, json={"name": "TEST_QO_Cliente"}).json()
        # product
        prod = requests.post(f"{BASE}/c/products", headers=H,
                             json={"name": "TEST_Prod", "price": 20, "weight_g": 10, "print_minutes": 20,
                                   "finished_stock": 10}).json()
        # quote
        q_body = {"client_id": c["id"], "items": [{"product_id": prod["id"], "name": prod["name"],
                                                    "qty": 2, "unit_price": 20, "unit_cost": 5}]}
        q = requests.post(f"{BASE}/c/quotes", headers=H, json=q_body)
        assert q.status_code == 200, q.text
        qid = q.json()["id"]

        # convert
        c1 = requests.post(f"{BASE}/quotes/{qid}/convert", headers=H)
        assert c1.status_code == 200, c1.text
        order = c1.json()
        assert order["items"][0]["qty"] == 2
        oid = order["id"]
        TestQuoteOrder.oid = oid
        TestQuoteOrder.total = order["total"]
        TestQuoteOrder.prod_id = prod["id"]

        # second convert fails
        c2 = requests.post(f"{BASE}/quotes/{qid}/convert", headers=H)
        assert c2.status_code == 409

    def test_payment_overpay_409(self, H):
        oid = TestQuoteOrder.oid
        r = requests.post(f"{BASE}/orders/{oid}/payments", headers=H,
                          json={"amount": 999999})
        assert r.status_code == 409

    def test_partial_payment(self, H):
        oid = TestQuoteOrder.oid
        total = TestQuoteOrder.total
        half = round(total / 2, 2)
        r = requests.post(f"{BASE}/orders/{oid}/payments", headers=H, json={"amount": half})
        assert r.status_code == 200
        det = requests.get(f"{BASE}/orders/{oid}/detail", headers=H).json()
        assert det["paid"] == half
        assert det["balance"] > 0

    def test_scheduled_installments_n3(self, H):
        oid = TestQuoteOrder.oid
        det = requests.get(f"{BASE}/orders/{oid}/detail", headers=H).json()
        unscheduled = det["unscheduled"]
        if unscheduled <= 0:
            pytest.skip("no unscheduled balance")
        r = requests.post(f"{BASE}/orders/{oid}/payments", headers=H,
                          json={"amount": unscheduled, "n": 3, "scheduled": True})
        assert r.status_code == 200
        assert len(r.json()) == 3

    def test_order_delivered_decrements_stock(self, H):
        oid = TestQuoteOrder.oid
        pid = TestQuoteOrder.prod_id
        before = requests.get(f"{BASE}/c/products/{pid}", headers=H).json()
        stock_before = float(before.get("finished_stock") or 0)
        r = requests.post(f"{BASE}/orders/{oid}/status", headers=H, json={"status": "entregue"})
        assert r.status_code == 200
        after = requests.get(f"{BASE}/c/products/{pid}", headers=H).json()
        assert float(after.get("finished_stock") or 0) == stock_before - 2


# ---------------- Finance
class TestFinance:
    def test_batch_parcelado(self, H):
        r = requests.post(f"{BASE}/transactions/batch", headers=H,
                          json={"base": {"type": "despesa", "description": "TEST_Parcela", "category": "Marketing"},
                                "mode": "parcelado", "total_amount": 1200, "n": 6,
                                "first_due": "2026-02-10"})
        assert r.status_code == 200
        out = r.json()
        assert len(out) == 6
        # each ~ 200 not 1200
        assert all(abs(t["amount"] - 200) < 1 for t in out)
        TestFinance.tids = [t["id"] for t in out]

    def test_pay_and_unpay(self, H):
        tid = TestFinance.tids[0]
        r = requests.post(f"{BASE}/transactions/{tid}/pay", headers=H, json={})
        assert r.status_code == 200 and r.json()["paid_date"]
        r2 = requests.post(f"{BASE}/transactions/{tid}/unpay", headers=H)
        assert r2.status_code == 200 and r2.json()["paid_date"] is None

    def test_overview(self, H):
        r = requests.get(f"{BASE}/finance/overview", headers=H)
        assert r.status_code == 200
        assert "balance" in r.json() and "payables_total" in r.json()

    def test_reconcile(self, H):
        bal = requests.get(f"{BASE}/finance/overview", headers=H).json()["balance"]
        r = requests.post(f"{BASE}/finance/reconcile", headers=H,
                          json={"counted_balance": bal, "note": "TEST", "create_adjustment": False})
        assert r.status_code == 200


# ---------------- Reports / Dashboard
class TestReports:
    def test_dashboard(self, H):
        r = requests.get(f"{BASE}/dashboard", headers=H)
        assert r.status_code == 200
        d = r.json()
        assert "metrics" in d and "finance" in d

    def test_reports(self, H):
        r = requests.get(f"{BASE}/reports?start=2026-01-01&end=2026-01-31", headers=H)
        assert r.status_code == 200
        assert "summary" in r.json()

    def test_purchases_suggestions(self, H):
        r = requests.get(f"{BASE}/purchases/suggestions", headers=H)
        assert r.status_code == 200 and isinstance(r.json(), list)

    def test_production_schedule(self, H):
        r = requests.get(f"{BASE}/production/schedule", headers=H)
        assert r.status_code == 200 and "printers" in r.json()

    def test_products_overview(self, H):
        r = requests.get(f"{BASE}/products/overview", headers=H)
        assert r.status_code == 200 and isinstance(r.json(), list)


# ---------------- Purchases status flow
class TestPurchases:
    def test_purchase_comprado_recebido(self, H):
        # Create a test material
        m = requests.post(f"{BASE}/c/materials", headers=H,
                          json={"name": "TEST_PurchMat", "kind": "consumivel", "unit": "un",
                                "qty": 0, "unit_cost": 2.0}).json()
        # Create planned purchase
        p = requests.post(f"{BASE}/c/purchases", headers=H,
                          json={"material_id": m["id"], "name": "TEST_Compra", "qty": 10,
                                "est_unit_price": 2.0, "unit": "un", "status": "planejado"}).json()
        pid = p["id"]
        # transition to comprado -> creates ONE despesa
        r = requests.post(f"{BASE}/purchases/{pid}/status", headers=H,
                          json={"status": "comprado", "paid": False})
        assert r.status_code == 200
        updated = r.json()
        assert updated.get("transaction_id")
        tx_id_first = updated["transaction_id"]
        # recebido -> adds stock, no new tx
        r2 = requests.post(f"{BASE}/purchases/{pid}/status", headers=H, json={"status": "recebido"})
        assert r2.status_code == 200
        final = requests.get(f"{BASE}/c/purchases/{pid}", headers=H).json()
        assert final["transaction_id"] == tx_id_first  # unchanged, no second tx
        mat_after = requests.get(f"{BASE}/c/materials/{m['id']}", headers=H).json()
        assert float(mat_after["qty"]) >= 10


# ---------------- Production jobs
class TestProduction:
    def test_job_complete_consumes_once(self, H):
        # create material filamento with stock
        mat = requests.post(f"{BASE}/c/materials", headers=H,
                            json={"name": "TEST_Fil", "kind": "filamento", "unit": "g",
                                  "qty": 1000, "unit_cost": 0.1}).json()
        prod = requests.post(f"{BASE}/c/products", headers=H,
                             json={"name": "TEST_ProdJob", "weight_g": 50, "print_minutes": 30,
                                   "filament_material_id": mat["id"], "finished_stock": 0}).json()
        client = requests.post(f"{BASE}/c/clients", headers=H, json={"name": "TEST_JobCli"}).json()
        order = requests.post(f"{BASE}/c/orders", headers=H,
                              json={"client_id": client["id"],
                                    "items": [{"product_id": prod["id"], "name": prod["name"],
                                               "qty": 2, "unit_price": 30, "unit_cost": 5}]}).json()
        jobs = requests.post(f"{BASE}/orders/{order['id']}/jobs", headers=H).json()
        assert len(jobs) >= 1
        jid = jobs[0]["id"]
        s = requests.post(f"{BASE}/jobs/{jid}/start", headers=H)
        assert s.status_code == 200
        c = requests.post(f"{BASE}/jobs/{jid}/complete", headers=H,
                          json={"status": "concluido", "approved_qty": 2, "real_weight": 100})
        assert c.status_code == 200
        # second complete should 409
        c2 = requests.post(f"{BASE}/jobs/{jid}/complete", headers=H,
                           json={"status": "concluido", "approved_qty": 2})
        assert c2.status_code == 409
        # finished stock added
        p_after = requests.get(f"{BASE}/c/products/{prod['id']}", headers=H).json()
        assert float(p_after.get("finished_stock") or 0) >= 2
