import 'package:go_router/go_router.dart';

import '../../motion.dart';
import '../../router.dart' show SubPage;
import 'occupation_screen.dart';
import 'occupations_home.dart';
import 'round_screen.dart';
import 'rounds_screen.dart';

/// The Jobs tab's routes, mounted by the router as the Jobs branch. The root stays '/jobs'.
final List<RouteBase> occupationRoutes = [
  GoRoute(
    path: '/jobs',
    builder: (c, s) => const OccupationsHomeScreen(),
    routes: [
      GoRoute(
        path: 'occupation/:anzsco',
        pageBuilder: (c, s) => sharedAxisPage(s, SubPage(child: OccupationScreen(anzsco: s.pathParameters['anzsco']!))),
      ),
      GoRoute(
        path: 'rounds',
        pageBuilder: (c, s) => sharedAxisPage(s, const SubPage(child: RoundsScreen())),
        routes: [
          GoRoute(
            path: ':subclass/:date',
            pageBuilder: (c, s) => sharedAxisPage(
              s,
              SubPage(
                child: RoundScreen(
                  subclass: s.pathParameters['subclass']!,
                  date: DateTime.tryParse(s.pathParameters['date']!) ?? DateTime(2000),
                ),
              ),
            ),
          ),
        ],
      ),
    ],
  ),
];
