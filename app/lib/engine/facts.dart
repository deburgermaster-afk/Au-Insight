/// The typed case file. Every field is optional: a missing fact is never
/// guessed, it makes dependent criteria "unknown" and becomes a question.
/// JSON keys match the TypeScript engine and the `cases.facts` column.
library;

const englishLevels = ['none', 'functional', 'vocational', 'competent', 'proficient', 'superior'];
const qualificationLevels = ['none', 'recognised_by_assessing_authority', 'diploma_or_trade', 'bachelor_or_masters', 'doctorate'];
const partnerStatuses = ['single', 'partner_citizen_or_pr', 'partner_skilled', 'partner_competent_english', 'partner_other'];
const occupationListNames = ['MLTSSL', 'STSOL', 'ROL', 'CSOL'];

class CaseFacts {
  const CaseFacts([this.values = const {}]);

  /// Raw fact values keyed by fact name; absent key = unknown.
  final Map<String, Object?> values;

  factory CaseFacts.fromJson(Map<String, dynamic>? json) {
    final out = <String, Object?>{};
    json?.forEach((k, v) {
      if (v == null || !factQuestions.containsKey(k)) return;
      out[k] = v is List ? v.map((e) => e.toString()).toList() : v;
    });
    return CaseFacts(out);
  }

  Map<String, Object?> toJson() => Map.of(values);

  Object? operator [](String key) => values[key];

  CaseFacts set(String key, Object? value) {
    final next = Map.of(values);
    if (value == null) {
      next.remove(key);
    } else {
      next[key] = value;
    }
    return CaseFacts(next);
  }

  String? get dateOfBirth => values['dateOfBirth'] as String?;
  String? get assessmentDate => values['assessmentDate'] as String?;
  String? get englishLevel => values['englishLevel'] as String?;
  num? get overseasSkilledYears => values['overseasSkilledYears'] as num?;
  num? get australianSkilledYears => values['australianSkilledYears'] as num?;
  String? get highestQualification => values['highestQualification'] as String?;
  String? get partnerStatus => values['partnerStatus'] as String?;
  List<String> get occupationLists => (values['occupationLists'] as List?)?.cast<String>() ?? const [];
  bool? flag(String key) => values[key] as bool?;
}

const factQuestions = <String, String>{
  'dateOfBirth': 'What is your date of birth?',
  'assessmentDate': 'What date should this be assessed at (e.g. your invitation date)?',
  'occupationCode': 'What is your nominated occupation (ANZSCO code or title)?',
  'occupationLists': 'Which skilled occupation list is your occupation on?',
  'positiveSkillsAssessment': 'Do you hold a positive skills assessment for your nominated occupation?',
  'englishLevel': 'What is your English level from a recognised test (competent, proficient or superior)?',
  'overseasSkilledYears': 'How many years of skilled employment outside Australia in the last 10 years?',
  'australianSkilledYears': 'How many years of skilled employment in Australia in the last 10 years?',
  'highestQualification': 'What is your highest qualification?',
  'specialistEducation': 'Do you hold an Australian Masters by research or Doctorate in a STEM field?',
  'australianStudyRequirement': 'Have you met the Australian study requirement (at least 2 academic years in Australia)?',
  'professionalYear': 'Have you completed a Professional Year in Australia?',
  'credentialledCommunityLanguage': 'Do you hold a NAATI credentialled community language qualification?',
  'regionalStudy': 'Did you study in regional Australia?',
  'partnerStatus': 'What is your partner situation?',
  'stateNomination': 'Have you been nominated by a state or territory government (subclass 190)?',
  'regionalNominationOrSponsorship': 'Do you have a state nomination or eligible family sponsorship for regional (subclass 491)?',
  'invitationReceived': 'Have you received an invitation to apply?',
  'meetsHealth': 'Are you free of any known health condition that could affect the health requirement?',
  'meetsCharacter': 'Are you free of anything (convictions, past visa issues) that could affect the character requirement?',
  'hasCommonwealthDebt': 'Do you owe any outstanding debts to the Australian Government?',
};

int ageOn(String dateOfBirth, String on) {
  final dob = DateTime.parse(dateOfBirth);
  final at = DateTime.parse(on);
  var age = at.year - dob.year;
  if (at.month < dob.month || (at.month == dob.month && at.day < dob.day)) age -= 1;
  return age;
}

String todayIso() => DateTime.now().toIso8601String().substring(0, 10);
