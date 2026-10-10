import 'package:go_router/go_router.dart';

import '../../data/study_models.dart';
import '../../motion.dart';
import '../../router.dart' show SubPage;
import 'compare_screen.dart';
import 'course_screen.dart';
import 'plan_screen.dart';
import 'provider_screen.dart';
import 'shortlist_screen.dart';
import 'study_home.dart';
import 'universities_screen.dart';

/// The Study tab's routes, mounted by the router as the Study branch. The root stays '/study'.
final List<RouteBase> studyRoutes = [
  GoRoute(
    path: '/study',
    builder: (c, s) => const StudyHomeScreen(),
    routes: [
      GoRoute(
        path: 'course/:code',
        pageBuilder: (c, s) => sharedAxisPage(
          s,
          SubPage(
            child: CourseScreen(code: s.pathParameters['code']!, initial: s.extra is CourseSummary ? s.extra as CourseSummary : null),
          ),
        ),
      ),
      GoRoute(
        path: 'provider/:code',
        pageBuilder: (c, s) => sharedAxisPage(s, SubPage(child: ProviderScreen(code: s.pathParameters['code']!))),
      ),
      GoRoute(
        path: 'compare',
        pageBuilder: (c, s) => sharedAxisPage(
          s,
          SubPage(
            child: CompareScreen(codes: (s.uri.queryParameters['codes'] ?? '').split(',').where((x) => x.trim().isNotEmpty).toList()),
          ),
        ),
      ),
      GoRoute(
        path: 'shortlist',
        pageBuilder: (c, s) => sharedAxisPage(s, const SubPage(child: ShortlistScreen())),
      ),
      GoRoute(
        path: 'universities',
        pageBuilder: (c, s) => sharedAxisPage(s, const SubPage(child: UniversitiesScreen())),
      ),
      GoRoute(
        path: 'plan',
        pageBuilder: (c, s) => sharedAxisPage(s, const SubPage(child: PlanScreen())),
      ),
    ],
  ),
];
