"""Synthetic checks for the diagnostic sweep, not a production optimizer."""
import unittest
from calibrate_experto import run


def fixture(cuts, grain=False):
    return {'placa': {'base': 2750, 'altura': 1830, 'veta': grain}, 'cortes': [
        {'id': i, 'cantidad': qty, 'base': w, 'altura': h, 'rota': not grain}
        for i, (qty, w, h) in enumerate(cuts)]}


class CalibrationTest(unittest.TestCase):
    def test_reference_baseline(self):
        result = run(fixture([(3, 1500, 1500)]), 'area', 'reference', 2, 'normal')
        self.assertEqual(result['boards'], 3)
        self.assertAlmostEqual(result['metres'], 37.3464)

    def test_rotation_when_both_orientations_fit(self):
        data = fixture([(5, 1600, 500)])
        baseline = run(data, 'area', 'reference', 2, 'normal')
        alternative = run(data, 'area', 'reference', 2, 'repeat')
        self.assertEqual(baseline['boards'], 2)
        self.assertEqual(alternative['boards'], 1)
        self.assertEqual(len(alternative['sheets'][0]['p']), 5)
        self.assertEqual(alternative['sheets'][0]['p'][0][3:], (500, 1600))
        self.assertTrue(all(sorted(p[3:]) == [500, 1600] for p in alternative['sheets'][0]['p']))
        # A witness of geometric improvement, not proof of the supplier's rule.

    def test_split_direction_requires_different_choices(self):
        horizontal = fixture([(1, 2500, 1000), (1, 2400, 600), (1, 2600, 100)], grain=True)
        vertical = fixture([(3, 2000, 580), (1, 400, 1400)], grain=True)
        vertical['placa']['base'] = 2600
        for data in (horizontal, vertical):
            self.assertEqual(run(data, 'area', 'reference', 2, 'normal')['boards'], 2)
        self.assertEqual(run(horizontal, 'area', 'horizontal', 2, 'normal')['boards'], 1)
        self.assertEqual(run(vertical, 'area', 'vertical', 2, 'normal')['boards'], 1)
        self.assertEqual(run(vertical, 'area', 'minarea', 2, 'normal')['boards'], 2)

    def test_grain_overrides_orientation_experiment(self):
        data = fixture([(5, 1600, 500)], grain=True)
        self.assertEqual(run(data, 'area', 'reference', 2, 'repeat')['boards'], 2)

    def test_bounds_separation_and_occurrences(self):
        data = fixture([(7, 870, 640), (4, 1300, 250), (8, 450, 290)])
        for rule in ['reference', 'horizontal', 'vertical', 'minarea', 'maxarea', 'shorter', 'longer']:
            result = run(data, 'area', rule, 2, 'repeat')
            self.assertEqual(sum(len(s['p']) for s in result['sheets']), 19)
            for sheet in result['sheets']:
                for index, (_, x, y, w, h) in enumerate(sheet['p']):
                    self.assertGreaterEqual(x, 0)
                    self.assertGreaterEqual(y, 0)
                    self.assertLessEqual(x+w, 2740+1e-6)
                    self.assertLessEqual(y+h, 1820+1e-6)
                    for _, bx, by, bw, bh in sheet['p'][index+1:]:
                        separated = x+w+4.4 <= bx+1e-6 or bx+bw+4.4 <= x+1e-6 or y+h+4.4 <= by+1e-6 or by+bh+4.4 <= y+1e-6
                        self.assertTrue(separated)

    def test_invalid_inputs_and_oversize(self):
        for data in [fixture([(0, 100, 100)]), fixture([(1, 40, 100)]), fixture([(1, 4000, 4000)]), fixture([(20001, 100, 100)])]:
            with self.assertRaises(ValueError):
                run(data)


if __name__ == '__main__':
    unittest.main()
