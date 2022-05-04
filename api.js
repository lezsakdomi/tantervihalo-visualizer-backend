import "https://unpkg.com/exceljs@4.3.0/dist/exceljs.js";

const TANTERVIHALO_LOADER_WORKBOOK = Symbol('workbook');
const TANTERVIHALO_LOADER_LOADED_PROMISE = Symbol('loadedPromise');
const TANTERVIHALO_LOADER_LOAD = Symbol('load');
const TANTERVIHALO_LOADER_TANTERVIHALOS = Symbol('tantervihalos')
export class TantervihaloLoader extends EventTarget {
	constructor(xlsxData) {
		super()

		this[TANTERVIHALO_LOADER_TANTERVIHALOS] = [];
		this[TANTERVIHALO_LOADER_WORKBOOK] = new ExcelJS.Workbook;
		this[TANTERVIHALO_LOADER_LOADED_PROMISE] = this[TANTERVIHALO_LOADER_LOAD](xlsxData);
	}

	async [TANTERVIHALO_LOADER_LOAD](data) {
		await this.workbook.xlsx.load(data);

		for (const ws of this.workbook.worksheets) {
			const tantervihalo = new Tantervihalo({title: ws.getRow(1).getCell(1).text});
			this[TANTERVIHALO_LOADER_TANTERVIHALOS].push(tantervihalo);
			const tantervihaloEventTarget = new EventTarget();
			this.dispatchEvent(new CustomEvent('tantervihaloFound',
				{detail: {tantervihalo, eventTarget: tantervihaloEventTarget, excelRow: ws.getRow(1)}}));

			let module, moduleEventTarget;
			for (let i = 2; i <= ws.actualRowCount; i++) {
				const row = ws.getRow(i);
				if (row.actualCellCount === 0) {
					if (module && !module.initialized) {
						// skipping row
					} else {
						module = new CurriculumModule({tantervihalo});
						moduleEventTarget = new EventTarget();
						tantervihaloEventTarget.dispatchEvent(new CustomEvent('moduleFound',
							{detail: {module, eventTarget: moduleEventTarget, excelRow: row}}));
					}
				} else if (module === undefined) {
					this.dispatchEvent(new CustomEvent('unexpectedRow',
						{detail: {excelRow: row}}));
				} else {
					if (row.getCell(1).isMerged) {
						const title = module.title = row.getCell(1).text;
						moduleEventTarget.dispatchEvent(new CustomEvent('titleFound',
							{detail: {title, excelRow: row}}));
					} else {
						if (row.getCell(1).style.font.bold) {
							const headers = [];
							for (let j = 1; j <= row.actualCellCount; j++) {
								headers.push(row.getCell(j).text);
							}
							module.headers = headers;
						} else if (row.getCell(1).text === "") {
							moduleEventTarget.dispatchEvent(new CustomEvent('skippedSumRow',
								{detail: {excelRow: row}}));
						} else {
							const cellArray = [];
							for (let j = 1; j <= (/* row.actualCellCount */ module.initialized ? module.headers.length : row.actualCellCount); j++) {
								cellArray.push(row.getCell(j).text);
							}
							const subject = module.push(cellArray);
							moduleEventTarget.dispatchEvent(new CustomEvent('subjectFound',
								{detail: {subject, excelRow: row}}));
						}
					}
				}
			}
		}
	}

	get workbook() {
		return this[TANTERVIHALO_LOADER_WORKBOOK];
	}

	get loadedPromise() {
		return this[TANTERVIHALO_LOADER_LOADED_PROMISE];
	}

	get tantervihalos() {
		return [...this[TANTERVIHALO_LOADER_TANTERVIHALOS]];
	}
}

export const AssessmentTypes = {
	combined: Symbol('COMBINED_GRADE'),
	combinedPractice: Symbol('COMBINED_PRACTICE_GRADE'),
	combinedContinuous: Symbol('COMBINED_GRADE_WITH_CONTINUOUS_ASSESSMENT'),
	exam: Symbol('EXAM_GRADE'),
	practice: Symbol('PRACTICE_GRADE'),
};

const TANTERVIHALO_MODULES = Symbol('modules');
export class Tantervihalo {
	[TANTERVIHALO_MODULES];

	constructor({title}) {
		this.title = title;
		this[TANTERVIHALO_MODULES] = [];
	}

	push(...args) {
		this[TANTERVIHALO_MODULES].push(...args);
	}

	*[Symbol.iterator]() {
		for (let module of this.modules) {
			for (let subject of module) {
				yield subject;
			}
		}
	}

	get modules() {
		return this[TANTERVIHALO_MODULES].filter(module => !module.ignored);
	}

	findSubject({code}) {
		for (const subject of this) {
			if (subject.code === code) return subject;
		}

		return {code}; // fallback
	}
}

const MODULE_TANTERVIHALO = Symbol('tantervihalo');
const MODULE_HINT = Symbol('hint');
const MODULE_HEADERS = Symbol('headers');
const MODULE_TITLE = Symbol('title');
const MODULE_ROWS = Symbol('rows');
const MODULE_ELECTIVE = Symbol('elective');
const MODULE_IGNORED = Symbol('ignored');
export class CurriculumModule {
	[MODULE_TANTERVIHALO];
	[MODULE_HEADERS];
	[MODULE_TITLE];
	[MODULE_ROWS];
	[MODULE_ELECTIVE];
	[MODULE_IGNORED];

	constructor({tantervihalo}) {
		tantervihalo[TANTERVIHALO_MODULES].push(this);
		this[MODULE_TANTERVIHALO] = tantervihalo;
	}

	get [MODULE_HINT]() {
		if (this[MODULE_TANTERVIHALO] && this[MODULE_TANTERVIHALO][TANTERVIHALO_MODULES][0] !== this) {
			let last;
			for (const curr of this[MODULE_TANTERVIHALO][TANTERVIHALO_MODULES]) {
				if (curr === this) break;
				last = curr;
			}
			return last;
		}
	}

	get headers() {
		return [...this[MODULE_HEADERS]];
	}

	set headers(headers) {
		this[MODULE_HEADERS] = [...headers];
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
		return !!this.title.match(/elective|választható/i);
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
				code: (row["Code"] || row["Kód"]),
				name: (row["Courses"] || row["Tanegység"] || "").match(/(.*)[\s*]*/)[1],
				requirements: (row["Subject requirement"] ?
					row["Subject requirement"].split(/, ?/)
					: (this.headers.includes("Előfeltétel 1") && this.headers.includes("Előfeltétel 1")) ?
					[
						...(row["Előfeltétel 1"] ? row["Előfeltétel 1"].split(/, | vagy /) : []),
						...(row["Előfeltétel 2"] ? row["Előfeltétel 2"].split(/, | vagy /) : []),
					]
					: []).map(s => /[\wÀ-ú\d-]+/.exec(s)[0]),
				credits: {
					lecture: parseInt(row["Lecture (L)"] || row["Előadás"]),
					labor: parseInt(row["Labor"]),
					practice: parseInt(row["Practice (Pr)"] || row["Gyakorlat"]),
					consultation: parseInt(row["Consultation" || row["Konzultáció"]]),
					total: parseInt(row["Credit"] || row["Kredit"]),
				},
				assessmentType: {
						"X": {
							"": AssessmentTypes.combined,
							"PG": AssessmentTypes.combinedPractice,
							"Gy": AssessmentTypes.combinedPractice,
							"CA": AssessmentTypes.combinedContinuous,
						}[row["Practice Grade (PG)" || row["Gyak. jegy"]]],
						"E": AssessmentTypes.exam,
						"K": AssessmentTypes.exam,
						"": {
							"PG": AssessmentTypes.practice,
							"Gy": AssessmentTypes.practice,
							"": undefined,
						}[row["Practice Grade (PG)" || row["Gyak. jegy"]]],
					}[row["Exam (E)"] || row["Vizsga"]],
				recommendedSemester: parseInt(row["Semester"] || row["Ajánlott félév"]),
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
export class Subject {
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
		return this[SUBJECT_REQUIREMENTS].map(code => this[SUBJECT_MODULE][MODULE_TANTERVIHALO].findSubject({code}));
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
