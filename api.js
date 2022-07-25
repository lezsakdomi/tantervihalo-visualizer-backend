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
			if (ws.state !== 'visible') continue;

			const tantervihalo = new Tantervihalo({title: ws.getRow(1).getCell(1).text});
			this[TANTERVIHALO_LOADER_TANTERVIHALOS].push(tantervihalo);
			const tantervihaloEventTarget = new EventTarget();
			let tantervihaloResolve, tantervihaloReject;

			this.dispatchEvent(new CustomEvent('tantervihaloFound', {
				detail: {
					tantervihalo,
					eventTarget: tantervihaloEventTarget,
					excelRow: ws.getRow(1),
					promise: new Promise((resolve, reject) => {
						tantervihaloResolve = resolve;
						tantervihaloReject = reject;
					}),
				}
			}));

			let module, moduleEventTarget, moduleResolve, moduleReject;
			try {
				for (let i = 2; i <= ws.rowCount; i++) {
					const row = ws.getRow(i);
					if (row.actualCellCount === 0) {
						if (module && !module.initialized) {
							// skipping row
						} else {
							if (moduleResolve) moduleResolve(module);
							module = new CurriculumModule({tantervihalo});
							moduleEventTarget = new EventTarget();
							tantervihaloEventTarget.dispatchEvent(new CustomEvent('moduleFound', {
								detail: {
									module,
									eventTarget: moduleEventTarget,
									excelRow: row,
									promise: new Promise((resolve, reject) => {
										moduleResolve = resolve;
										moduleReject = reject;
									}),
								}
							}));
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
							if (module && !module.initialized && row.getCell(1).style.font.bold) {
								const headers = [];
								for (let j = 1; j <= row.actualCellCount; j++) {
									headers.push(str(row.getCell(j).text));
								}
								module.headers = headers;
								if (!tantervihalo[TANTERVIHALO_SUMS].initialized) {
									tantervihalo[TANTERVIHALO_SUMS].headers = headers;
								}
							} else if (row.getCell(1).style.font.bold || row.getCell(1).text === "") {
								if (!module[MODULE_ROWS] || module[MODULE_ROWS].length === 0) {
									tantervihalo[TANTERVIHALO_MODULES].splice(
										tantervihalo[TANTERVIHALO_MODULES].findIndex(m => m === module), 1);
									while (ws.getRow(i + 1).actualCellCount > 0) i++;
									continue;
								}

								const cellArray = [];
								for (let j = 1; j <= (/* row.actualCellCount */ module.initialized ? module.headers.length : row.actualCellCount); j++) {
									cellArray.push(str(row.getCell(j).text));
								}
								const sum = tantervihalo.sums.push(cellArray);
								tantervihaloEventTarget.dispatchEvent(new CustomEvent('sumRow', {
									detail: {
										sum,
										excelRow: row,
										promise: Promise.resolve(sum),
									}
								}));
							} else {
								const cellArray = [];
								for (let j = 1; j <= (/* row.actualCellCount */ module.initialized ? module.headers.length : row.actualCellCount); j++) {
									cellArray.push(str(row.getCell(j).text));
								}
								const subject = module.push(cellArray);
								moduleEventTarget.dispatchEvent(new CustomEvent('subjectFound', {
									detail: {
										subject,
										excelRow: row,
										promise: Promise.resolve(subject),
									}
								}));
							}
						}
					}
					await new Promise(res => setTimeout(res, 0));
				}

				if (!tantervihalo.modules[tantervihalo.modules.length - 1].initialized) {

				}

				tantervihaloResolve(tantervihalo);
			} catch (e) {
				if (moduleReject) moduleReject(e);
				if (tantervihaloReject) tantervihaloReject(e);
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

export const GradeTypes = {
	exam: Symbol('exam'),
	practice: Symbol('practice'),
	continuousPractice: Symbol('practice with continuous assessment'),
};

export const Topics = {
	inf: Symbol('Informatics'),
	mat: Symbol('Mathematics'),
	szam: Symbol('Computation theory'),
};

export const Specializations = {
	F: Symbol('Fejlesztő (C)'),
	T: Symbol('Tervező (B)'),
	M: Symbol('Modellező (A)'),
	get A() { return Specializations.M },
	get B() { return Specializations.T },
	get C() { return Specializations.F },
};

const TANTERVIHALO_MODULES = Symbol('modules');
const TANTERVIHALO_SUMS = Symbol('summaries');
export class Tantervihalo {
	[TANTERVIHALO_MODULES];
	[TANTERVIHALO_SUMS];

	constructor({title}) {
		this.title = title;
		this[TANTERVIHALO_MODULES] = [];
		this[TANTERVIHALO_SUMS] = new CurriculumModule({tantervihalo: this, title: "Summaries"});
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
		return this[TANTERVIHALO_MODULES]
			.filter(module => module !== this.sums)
			.filter((module, i, {length}) => i !== length - 1 || module.initialized)
			.filter(module => !module.ignored);
	}

	get sums() {
		return this[TANTERVIHALO_SUMS];
	}

	findSubject({code, name}) {
		for (const module of this[TANTERVIHALO_MODULES]) {
			for (const subject of module) {
				if (code && subject.code === code) return subject;
				if (name && subject.name === name) return subject;
			}
		}

		return {code}; // fallback
	}

	toJSON() {
		return {
			title: this.title,
			thesis: this.findSubject({name: "Szakdolgozati konzultáció"}),
			topics: {
				['Informatics']: this.findSubject({name: "Kötelezően választandó tárgyak Informatika ismeretkör"}),
				['Computation theory']: this.findSubject({name: "Kötelezően választandó tárgyak Számítástudomány ismeretkör"}),
				other: this.findSubject({name: "Szabadon választható tárgyak ütemezése kreditértékkel"}),
			},
			subjects: [...this],
		}
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

	constructor({tantervihalo, title = undefined}) {
		tantervihalo[TANTERVIHALO_MODULES].push(this);
		this[MODULE_TANTERVIHALO] = tantervihalo;
		if (title) {
			this[MODULE_TITLE] = title;
		}
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
		if (!this[MODULE_ROWS]) return;
		for (const row of this[MODULE_ROWS]) {
			try {
				yield new Subject({
					module: this,
					code: str(row["Code"] || row["Kód"]),
					name: str(row["Courses"] || row["Tanegység"] || "").match(/^(.*?)[\s*]*$/)[1],
					discontinued: !!str(row["Courses"] || row["Tanegység"] || "").match(/[^*]\*\*\s*$/),
					requirements: (row["Subject requirement"] ?
						str(row["Subject requirement"]).split(/, ?/)
						: (this.headers.includes("Előfeltétel 1") && this.headers.includes("Előfeltétel 1")) ?
						[
							...(row["Előfeltétel 1"] ? str(row["Előfeltétel 1"]).split(/, | vagy /) : []),
							...(row["Előfeltétel 2"] ? str(row["Előfeltétel 2"]).split(/, | vagy /) : []),
						]
						: this.headers.includes("Előfeltétel(ek)") ?
						(row["Előfeltétel(ek)"] ? str(row["Előfeltétel(ek)"]).split(/, *| *\/ */) : [])
						: []).map(s => /[\wÀ-ú\d-]+/.exec(s)[0]),
					credits: {
						lecture: parseInt(str(row["Lecture (L)"] || row["Előadás"])),
						labor: parseInt(str(row["Labor"])),
						practice: parseInt(str(row["Practice (Pr)"] || row["Gyakorlat"])),
						consultation: parseInt(str(row["Consultation"] || row["Konzultáció"])),
						total: parseInt(str(row["Credit"] || row["Kredit"])),
					},
					assessment: this.headers.includes("Számonkérés")
						? {
							combined: str(row["Számonkérés"]).startsWith('X'),
							grade: {
								"G": GradeTypes.practice,
								"K": GradeTypes.exam,
								"FG": GradeTypes.continuousPractice,
							}[str(row["Számonkérés"]).match(/X?(.*)/)[1]],
						}
						: {
							"X": {
								"": {combined: true, grade: GradeTypes.exam},
								"PG": {combined: true, grade: GradeTypes.practice},
								"Gy": {combined: true, grade: GradeTypes.practice},
								"CA": {combined: true, grade: GradeTypes.continuousPractice},
								"F": {combined: true, grade: GradeTypes.continuousPractice},
							}[row["Practice Grade (PG)" || row["Gyak. jegy"]]],
							"E": {combined: false, grade: GradeTypes.exam},
							"K": {combined: false, grade: GradeTypes.exam},
							"": {
								"PG": {combined: false, grade: GradeTypes.practice},
								"Gy": {combined: false, grade: GradeTypes.practice},
								"F": {combined: false, grade: GradeTypes.continuousPractice},
								"CA": {combined: false, grade: GradeTypes.continuousPractice},
								"": undefined,
							}[row["Practice Grade (PG)" || row["Gyak. jegy"]]],
						}[row["Exam (E)"] || row["Vizsga"]],
					recommendedSemester: str(row["Semester"] || row["Ajánlott félév"])
						.split(/[,.]\s*/g)
						.map(s => parseInt(s)),
					topic: this.headers.includes("Ismeretkör") && Topics[str(row["Ismeretkör"])
						.normalize("NFD").replace(/\W/g, '').toLowerCase()] || undefined,
					specializations: this.headers.includes("Specalizáció FTM") &&
						new Set([...row["Specalizáció FTM"]].map(c => Specializations[c])) || undefined,
				});
			} catch (e) {
				debugger
				throw e;
			}
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
				if (!this[MODULE_ROWS]) debugger;
				else this[MODULE_ROWS].push(row);
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
// const SUBJECT_MODULE = Symbol('module');
const SUBJECT_MODULE = 'module';
export class Subject {
	// constructor({module, code, name, discontinued, requirements: [...requirements], credits: {lecture, practice, labor, consultation, total: totalCredits}, assessment: {combined, grade}, recommendedSemester, topic, specializations}) {
	// 	this[SUBJECT_MODULE] = module;
	// 	this.code = code;
	// 	this.name = name;
	// 	this[SUBJECT_REQUIREMENTS] = [...requirements];
	// 	this.discontinued = discontinued;
	// 	this.credits = {
	// 		lecture,
	// 		practice,
	// 		labor,
	// 		consultation,
	// 		total: totalCredits,
	// 	};
	// 	this.assessment = {
	// 		combined,
	// 		grade,
	// 	};
	// 	this.recommendedSemester = recommendedSemester;
	// 	this.topic = topic;
	// 	this.specializations = specializations;
	// }

	constructor(data) {
		Object.assign(this, data);
	}

	get elective() {
		return this[SUBJECT_MODULE].elective;
	}

	set requirements(requirements) {
		this[SUBJECT_REQUIREMENTS] = [...requirements];
	}

	get requirements() {
		return this[SUBJECT_REQUIREMENTS].map(code => this[SUBJECT_MODULE][MODULE_TANTERVIHALO].findSubject({code}));
	}

	toString() {
		return this.name && `${this.name} (${this.code})` || this.code;
	}

	toJSON() {
		return {
			...Object.getOwnPropertyNames(this).reduce((a, v) => ({...a, [v]: this[v]}), {}),
			module: this[SUBJECT_MODULE].title,
			requirements: this[SUBJECT_REQUIREMENTS].map(req => [req]),
			assessment: {
				...this.assessment,
				grade: this.assessment.grade && this.assessment.grade
					.toString().match(/^Symbol\((.*)\)$/)[1]
					.toLowerCase()
					.replace(/_/g, ' ')
			},
			elective: this.elective,
		}
	}
}

function str(s) {
	if (s === undefined) {
		return undefined;
	}

	if (s.richText) {
		s = s.richText.map(t => t.text).join('');
	}

	s = s.toString();

	s = s.trim();

	return s;
}
