import unittest

from cti.feeds.caducidad import VIDA_DIAS, caduca


class Caducidad(unittest.TestCase):
    def test_vida_por_tipo(self):
        self.assertEqual(caduca("2026-01-01T00:00:00Z", "ip:port"), "2026-02-17T00:00:00Z")
        self.assertEqual(caduca("2026-01-01T00:00:00Z", "domain"), "2026-10-28T00:00:00Z")
        self.assertEqual(caduca("2026-01-01T00:00:00Z", "sha256_hash"), "2027-04-06T00:00:00Z")

    def test_tipo_desconocido_usa_la_vida_por_defecto(self):
        self.assertEqual(caduca("2026-01-01T00:00:00Z", "otro"), "2027-04-16T00:00:00Z")

    def test_las_vidas_son_las_de_opencti(self):
        self.assertEqual((VIDA_DIAS["ip:port"], VIDA_DIAS["url"], VIDA_DIAS["domain"], VIDA_DIAS["sha256_hash"]), (47, 47, 300, 460))


if __name__ == "__main__":
    unittest.main()
