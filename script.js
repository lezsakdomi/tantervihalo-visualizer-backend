async function fetchText(url) {
	const res = await fetch("https://api.allorigins.win/raw?url=" + encodeURIComponent(url), {});
	return res.text();
}

async function fetchBytes(url) {
	const res = await fetch("https://api.allorigins.win/raw?url=" + encodeURIComponent(url), {});
	const blob = await res.blob();
	return blob.arrayBuffer();
}

async function loadFileList(outerUl) {
	let innerUl = outerUl.appendChild(document.createElement('li'))
		.appendChild(document.createElement('ul'));

	const html = await fetchText("https://www.inf.elte.hu/tantervihalok");
	// const regexp = /<a class="jumptarget" id="([^"]*)" name="([^"]*)"><\/a>|<a href="([^"]*\.(pdf|xlsx?))" target="_blank">([^<]*)<\/a>/g;
	const regexp = /<h2(?: id="([^"]*)")>([^<]*)<\/h2>|<a href="([^"]*\.(pdf|xlsx?))" target="_blank">([^<]*)<\/a>/g;
	for (const match of html.matchAll(regexp)) {
		const [s, jumptargetId, jumptargetName, linkUrl, linkExt, linkName] = match;
		if (jumptargetName) {
			const li = outerUl.appendChild(document.createElement('li'));
			li.innerHTML = jumptargetName;
			innerUl = li.appendChild(document.createElement('ul'));
		} else {
			const a = innerUl
				.appendChild(document.createElement('li'))
				.appendChild(document.createElement('a'));
			a.innerHTML = linkName;
			a.href = linkUrl;
			a.dataset['extension'] = linkExt;

			switch (linkExt) {
				case 'xlsx': {
					const button = a.parentElement.appendChild(document.createElement('button'));
					button.innerText = 'select';
					button.addEventListener('click', async (evt) => {
						button.disabled = true;
						const ul = document.getElementById('fileContentUl');
						ul.innerText = "";
						document.getElementById('fileContentDetails').open = true;
						try {
							const bytes = await fetchBytes(linkUrl);
							const wb = new ExcelJS.Workbook;
							window.wb = wb;
							await wb.xlsx.load(bytes);
							for (const ws of wb.worksheets) {
								const wsLi = ul.appendChild(document.createElement('li'));
								const unit = new CurriculumUnit({title: ws.getRow(1).getCell(1).text});
								wsLi.representedUnit = unit;
								wsLi.innerText = unit.title;
								const wsUl = wsLi.appendChild(document.createElement('ul'));
								let module, moduleLi, moduleSpan, moduleDropdown, modulePre;
								for (let i = 2; i <= ws.actualRowCount; i++) {
									const row = ws.getRow(i);
									if (row.actualCellCount === 0) {
										if (module && !module.initialized) {
											// skipping row
										} else {
											moduleLi = wsUl.appendChild(document.createElement('li'));
											moduleSpan = moduleLi.appendChild(document.createElement('span'));
											moduleDropdown = moduleLi.appendChild(document.createElement('select'));
											modulePre = moduleLi.appendChild(document.createElement('pre'));
											module = new CurriculumModule({unit});
											moduleLi.representedModule = module;

											moduleDropdown.innerHTML = `
<option disabled></option>
<option value="compulsory">compulsory</option>
<option value="elective">elective</option>
<option value="ignored">ignored</option>`;
											(function (module, modulePre) {
													moduleDropdown.addEventListener('input', ({target: {value}}) => {
														switch (value) {
															case 'compulsory':
																module.ignored = false;
																module.elective = false;
																break;

															case 'elective':
																module.ignored = false;
																module.elective = true;
																break;

															case 'ignored':
																module.ignored = true;
																console.log(module);
																break;
														}

														modulePre.innerText = module.ignored ? "" : JSON.stringify(module, null, 2);
														console.log(value);
													});
												}
											)(module, modulePre);
										}
									} else if (module === undefined) {
										console.warn(`Skipping workbook ${wb.name} worksheet ${ws.name} row ${i}`);
									} else {
										if (row.getCell(1).isMerged) {
											moduleSpan.innerText = module.title = row.getCell(1).text;
										} else {
											if (row.getCell(1).style.font.bold) {
												const headers = [];
												for (let j = 1; j <= row.actualCellCount; j++) {
													headers.push(row.getCell(j).text);
												}
												module.headers = headers;
											} else if (row.getCell(1).text === "") {
												console.debug(`Skipping sum: workbook ${wb.name} worksheet ${ws.name} row ${i}`);
											} else {
												const cellArray = [];
												for (let j = 1; j <= (/* row.actualCellCount */ module.initialized ? module[MODULE_HEADERS].length : row.actualCellCount); j++) {
													cellArray.push(row.getCell(j).text);
												}
												module.push(cellArray);
											}
										}
										modulePre.innerText = module.ignored ? "" : JSON.stringify(module, null, 2);
									}
								}
								const displayButton = wsLi.insertBefore(document.createElement('button'), wsUl);
								displayButton.innerText = 'Select';
								let viz = new Viz();
								displayButton.addEventListener('click', async () => {
									document.getElementById('subjectListDetails').open = true;
									let graph = `digraph ${JSON.stringify(unit.title)} {`;
									graph += `label=${JSON.stringify(unit.title)};`;
									for (const module of unit.modules) {
										graph += `subgraph ${JSON.stringify("cluster_" + module.title)} {`;
										graph += `label=${JSON.stringify(module.title)};`;
										for (const subject of module) {
											graph += `${JSON.stringify(subject.code)};`;
											if (subject.elective) {
												graph += `${JSON.stringify(subject.code)}[style=dashed];`;
											}
										}
										graph += `}`;
									}
									graph += `rankdir=LR;`;
									for (const subject of unit) {
										for (const req of subject.requirements) {
											graph += `${JSON.stringify(req.code)}->${JSON.stringify(subject.code)};`;
										}
									}
									graph += `}`;
									try {
										document.getElementById('subjectListDiv')
											.dataset['graph'] = graph;
										document.getElementById('subjectListDiv')
											.representedUnit = unit;
										const element = await viz.renderSVGElement(graph);
										document.getElementById('subjectListDiv')
											.replaceChildren(element);
									} catch (e) {
										viz = new Viz();
										document.getElementById('subjectListDiv').innerText = e;
									}
									document.getElementById('subjectListDetails').scrollIntoView();
								});
							}
							document.getElementById('fileContentDiv').innerHTML = "";
							document.getElementById('fileListDetails').open = false;
							document.getElementById('fileContentDetails').scrollIntoView();
						} catch (e) {
							console.error(e);
							ul.innerHTML = e.toString();
							button.style.backgroundColor = 'red';
						} finally {
							button.disabled = false;
						}
					});
				}
					break;
			}
		}
	}
}

document.addEventListener('DOMContentLoaded', () => {
	const loadButton = document.getElementById('loadButton');
	loadButton.addEventListener('click', async () => {
		loadButton.disabled = true;
		const ul = document.getElementById('ul');
		ul.innerHTML = "";
		try {
			await loadFileList(ul);
		} catch (e) {
			console.error(e);
			ul.innerHTML = e.toString();
			loadButton.style.backgroundColor = 'red';
		} finally {
			loadButton.disabled = false;
		}
	});
});
