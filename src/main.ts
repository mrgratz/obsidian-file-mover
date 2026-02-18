import { App, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, TFolder } from "obsidian";

interface FileMoverSettings {
	archiveFolder: string;
	recommendedPathProperty: string;
	confirmBeforeMove: boolean;
}

const DEFAULT_SETTINGS: FileMoverSettings = {
	archiveFolder: "90_Archive",
	recommendedPathProperty: "recommended_path",
	confirmBeforeMove: true,
};

export default class FileMoverPlugin extends Plugin {
	settings: FileMoverSettings;

	async onload() {
		await this.loadSettings();

		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				if (!(file instanceof TFile)) return;

				// Archive option (hidden if already in archive folder)
				if (!file.path.startsWith(this.settings.archiveFolder + "/")) {
					menu.addItem((item) => {
						item.setTitle("Archive")
							.setIcon("archive")
							.onClick(() => this.handleArchive(file));
					});
				}

				// Relocate option (only when recommended_path exists)
				const cache = this.app.metadataCache.getFileCache(file);
				const recommendedPath = cache?.frontmatter?.[this.settings.recommendedPathProperty];
				if (recommendedPath && typeof recommendedPath === "string" && recommendedPath.trim()) {
					menu.addItem((item) => {
						item.setTitle(`Move to ${recommendedPath}`)
							.setIcon("folder-input")
							.onClick(() => this.handleRelocate(file, recommendedPath.trim()));
					});
				}
			})
		);

		this.addSettingTab(new FileMoverSettingTab(this.app, this));
	}

	async handleArchive(file: TFile) {
		const destination = `${this.settings.archiveFolder}/${file.path}`;

		if (this.settings.confirmBeforeMove) {
			new ConfirmMoveModal(this.app, file.name, destination, () => {
				this.archiveFile(file, destination);
			}).open();
		} else {
			await this.archiveFile(file, destination);
		}
	}

	async handleRelocate(file: TFile, recommendedPath: string) {
		// Ensure the path ends with .md if it doesn't have an extension
		const destination = recommendedPath.includes(".") ? recommendedPath : `${recommendedPath}.md`;

		if (!this.isValidVaultPath(destination)) {
			new Notice("Invalid path: must be a relative path within the vault");
			return;
		}

		if (this.settings.confirmBeforeMove) {
			new ConfirmMoveModal(this.app, file.name, destination, () => {
				this.relocateFile(file, destination);
			}).open();
		} else {
			await this.relocateFile(file, destination);
		}
	}

	async archiveFile(file: TFile, destination: string) {
		try {
			// Check if destination already exists
			const existing = this.app.vault.getAbstractFileByPath(destination);
			if (existing) {
				new Notice(`Cannot archive: file already exists at ${destination}`);
				return;
			}

			await this.ensureParentFolders(destination);
			await this.app.fileManager.renameFile(file, destination);
			new Notice(`Archived to ${destination}`);
		} catch (e) {
			new Notice(`Archive failed: ${e}`);
			console.error("File Mover: archive failed", e);
		}
	}

	async relocateFile(file: TFile, destination: string) {
		try {
			// Check if destination already exists
			const existing = this.app.vault.getAbstractFileByPath(destination);
			if (existing) {
				new Notice(`Cannot move: file already exists at ${destination}`);
				return;
			}

			await this.ensureParentFolders(destination);
			await this.app.fileManager.renameFile(file, destination);

			// Strip the recommended_path property from frontmatter
			// After rename, the file object's path has been updated
			const movedFile = this.app.vault.getAbstractFileByPath(destination);
			if (movedFile instanceof TFile) {
				await this.removeRecommendedPathProperty(movedFile);
			}

			new Notice(`Moved to ${destination}`);
		} catch (e) {
			new Notice(`Relocate failed: ${e}`);
			console.error("File Mover: relocate failed", e);
		}
	}

	async removeRecommendedPathProperty(file: TFile) {
		const propName = this.settings.recommendedPathProperty;
		await this.app.vault.process(file, (content) => {
			// Match frontmatter block
			const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
			if (!fmMatch) return content;

			const fmBlock = fmMatch[1];
			const lines = fmBlock.split("\n");
			const filtered = lines.filter((line) => {
				// Remove the property line (handles quoted and unquoted values)
				return !line.match(new RegExp(`^${propName}\\s*:`));
			});

			// If frontmatter is now empty, remove the entire block
			if (filtered.every((l) => l.trim() === "")) {
				return content.replace(/^---\n[\s\S]*?\n---\n?/, "");
			}

			return content.replace(/^---\n[\s\S]*?\n---/, `---\n${filtered.join("\n")}\n---`);
		});
	}

	isValidVaultPath(filePath: string): boolean {
		// Block absolute paths (Windows and Unix)
		if (/^[a-zA-Z]:/.test(filePath) || filePath.startsWith("/")) return false;
		// Block path traversal
		const segments = filePath.replace(/\\/g, "/").split("/");
		if (segments.some((s) => s === "..")) return false;
		return true;
	}

	async ensureParentFolders(filePath: string) {
		const parts = filePath.split("/");
		parts.pop(); // Remove the filename

		let current = "";
		for (const part of parts) {
			current = current ? `${current}/${part}` : part;
			const existing = this.app.vault.getAbstractFileByPath(current);
			if (!existing) {
				await this.app.vault.createFolder(current);
			}
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class ConfirmMoveModal extends Modal {
	fileName: string;
	destination: string;
	onConfirm: () => void;

	constructor(app: App, fileName: string, destination: string, onConfirm: () => void) {
		super(app);
		this.fileName = fileName;
		this.destination = destination;
		this.onConfirm = onConfirm;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl("p", { text: `Move "${this.fileName}" to:` });
		contentEl.createEl("p", { text: this.destination, cls: "mod-warning" });

		const buttonContainer = contentEl.createDiv({ cls: "modal-button-container" });

		buttonContainer.createEl("button", { text: "Confirm", cls: "mod-cta" })
			.addEventListener("click", () => {
				this.close();
				this.onConfirm();
			});

		buttonContainer.createEl("button", { text: "Cancel" })
			.addEventListener("click", () => {
				this.close();
			});
	}

	onClose() {
		this.contentEl.empty();
	}
}

class FileMoverSettingTab extends PluginSettingTab {
	plugin: FileMoverPlugin;

	constructor(app: App, plugin: FileMoverPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Archive folder")
			.setDesc("Root folder for archived files. Mirror paths are created under this folder.")
			.addText((text) =>
				text
					.setPlaceholder("90_Archive")
					.setValue(this.plugin.settings.archiveFolder)
					.onChange(async (value) => {
						this.plugin.settings.archiveFolder = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Recommended path property")
			.setDesc("Frontmatter property name used for the relocate action.")
			.addText((text) =>
				text
					.setPlaceholder("recommended_path")
					.setValue(this.plugin.settings.recommendedPathProperty)
					.onChange(async (value) => {
						this.plugin.settings.recommendedPathProperty = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Confirm before move")
			.setDesc("Show a confirmation dialog before moving files.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.confirmBeforeMove)
					.onChange(async (value) => {
						this.plugin.settings.confirmBeforeMove = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
