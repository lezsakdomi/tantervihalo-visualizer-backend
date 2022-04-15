const AssessmentTypes = {
	combined: Symbol('COMBINED_GRADE'),
	combinedPractice: Symbol('COMBINED_PRACTICE_GRADE'),
	combinedContinuous: Symbol('COMBINED_GRADE_WITH_CONTINOUS_ASSESSMENT'),
	exam: Symbol('EXAM_GRADE'),
	practice: Symbol('PRACTICE_GRADE'),
};

const UNIT_MODULES = Symbol('modules');
class CurriculumUnit {
	[UNIT_MODULES];

	constructor({title}) {
		this.title = title;
		this[UNIT_MODULES] = [];
	}

	push(...args) {
		this[UNIT_MODULES].push(...args);
	}

	*[Symbol.iterator]() {
		for (let module of this.modules) {
			for (let subject of module) {
				yield subject;
			}
		}
	}

	get modules() {
		return this[UNIT_MODULES].filter(module => !module.ignored);
	}

	findSubject({code}) {
		for (const subject of this) {
			if (subject.code === code) return subject;
		}

		return {code}; // fallback
	}
}

const MODULE_UNIT = Symbol('unit');
const MODULE_HINT = Symbol('hint');
const MODULE_HEADERS = Symbol('headers');
const MODULE_TITLE = Symbol('title');
const MODULE_ROWS = Symbol('rows');
const MODULE_ELECTIVE = Symbol('elective');
const MODULE_IGNORED = Symbol('ignored');
class CurriculumModule {
	[MODULE_UNIT];
	[MODULE_HEADERS];
	[MODULE_TITLE];
	[MODULE_ROWS];
	[MODULE_ELECTIVE];
	[MODULE_IGNORED];

	constructor({unit}) {
		unit[UNIT_MODULES].push(this);
		this[MODULE_UNIT] = unit;
	}

	get [MODULE_HINT]() {
		if (this[MODULE_UNIT] && this[MODULE_UNIT][UNIT_MODULES][0] !== this) {
			let last;
			for (const curr of this[MODULE_UNIT][UNIT_MODULES]) {
				if (curr === this) break;
				last = curr;
			}
			return last;
		}
	}

	set headers(headers) {
		this[MODULE_HEADERS] = headers;
		this[MODULE_ROWS] = [];
	}

	set title(title) {
		this[MODULE_TITLE] = title;
		this[MODULE_HEADERS] = undefined;
		this[MODULE_ROWS] = undefined;
	}

	get title() {
		return this[MODULE_TITLE];
	}

	get initialized() {
		return !!this[MODULE_ROWS];
	}

	get elective() {
		if (this[MODULE_ELECTIVE] !== undefined) return this[MODULE_ELECTIVE];
		return !!this.title.match(/elective/i);
	}

	set elective(value) {
		this[MODULE_ELECTIVE] = value;
	}

	get ignored() {
		if (this[MODULE_IGNORED] !== undefined) return this[MODULE_IGNORED];
		return false;
	}

	set ignored(value) {
		this[MODULE_IGNORED] = value;
	}

	get length() {
		return this[MODULE_ROWS].length;
	}

	*[Symbol.iterator]() {
		for (const row of this[MODULE_ROWS]) {
			yield new Subject({
				module: this,
				code: row["Code"],
				name: row["Courses"].match(/(.*)[\s*]*/)[1],
				requirements: row["Subject requirement"] ? row["Subject requirement"].split(/, ?/) : [],
				credits: {
					lecture: parseInt(row["Lecture (L)"]),
					labor: parseInt(row["Labor"]),
					practice: parseInt(row["Practice (Pr)"]),
					consultation: parseInt(row["Consultation"]),
					total: parseInt(row["Credit"]),
				},
				assessmentType: {
						"X": {
							"": AssessmentTypes.combined,
							"PG": AssessmentTypes.combinedPractice,
							"CA": AssessmentTypes.combinedContinuous,
						}[row["Practice Grade (PG)"]],
						"E": AssessmentTypes.exam,
						"": {
							"PG": AssessmentTypes.practice,
							"": undefined,
						}[row["Practice Grade (PG)"]],
					}[row["Exam (E)"]],
				recommendedSemester: parseInt(row["Semester"]),
			});
		}
	}

	push(...args) {
		if (!this.initialized && this[MODULE_HINT]) {
			this.headers = this[MODULE_HINT][MODULE_HEADERS];
		}

		for (const arg of args) {
			if (Array.isArray(arg)) {
				const row = {};
				for (const i in this[MODULE_HEADERS]) {
					row[this[MODULE_HEADERS][i]] = arg[i];
				}
				this[MODULE_ROWS].push(row);
			} else {
				throw new Error("Unexpected type of arg");
			}
		}
	}

	toJSON() {
		return {
			title: this.title,
			subjects: this.initialized && [...this] || undefined,
		};
	}
}

const SUBJECT_REQUIREMENTS = Symbol('requirements');
const SUBJECT_MODULE = Symbol('module');
class Subject {
	constructor({module, code, name, requirements: [...requirements], credits: {lecture, practice, labor, consultation, total: totalCredits}, assessmentType, recommendedSemester}) {
		this[SUBJECT_MODULE] = module;
		this.code = code;
		this.name = name;
		this[SUBJECT_REQUIREMENTS] = [...requirements];
		this.credits = {
			lecture,
			practice,
			labor,
			consultation,
			total: totalCredits,
		};
		this.assessmentType = assessmentType;
		this.recommendedSemester = recommendedSemester;
	}

	get elective() {
		return this[SUBJECT_MODULE].elective;
	}

	get requirements() {
		return this[SUBJECT_REQUIREMENTS].map(code => this[SUBJECT_MODULE][MODULE_UNIT].findSubject({code}));
	}

	toJSON() {
		return {
			module: this[SUBJECT_MODULE].title,
			code: this.code,
			name: this.name,
			requirements: this[SUBJECT_REQUIREMENTS],
			credits: {
				lecture: this.credits.lecture,
				practice: this.credits.practice,
				labor: this.credits.labor,
				consultation: this.credits.consultation,
				total: this.credits.total,
			},
			assessmentType: this.assessmentType && this.assessmentType
				.toString().match(/^Symbol\((.*)\)$/)[1]
				.toLowerCase()
				.replace(/_/g, ' '),
			recommendedSemester: this.recommendedSemester,
			elective: this.elective,
		}
	}
}
