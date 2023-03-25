"use strict";

class Apps {
    constructor() {
        this.apps = null;
        this.render();
        this.get_apps();
    }

    destructor(forced) {
        return true;
    }

    async get_apps() {
        if (!app.badge.is_connected()) {
            console.log("Badge not connected");
            this.apps = null;
            return;
        }

        this.apps = null;
        this.apps = await app.badge.app_list();

        if (app.page === this) {
            this.render();
        }
    }

    render() {
        let content = {
            header: {
                title: "Apps",
                breadcrumbs: [
                    {
                        label: "Apps"
                    }
                ]
            },
            content: [
                [
                    {
                        width: 12,
                        content: [
                            {
                                type: "card",
                                content: {
                                    color: "white",
                                    padding: "0",
                                    header: {
                                        color: "primary",
                                        content: [
                                            {
                                                type: "title",
                                                card: true,
                                                icon: "box",
                                                content: " Apps"
                                            }
                                        ],
                                        tools: [
                                            {
                                                type: "link",
                                                icon: "plus",
                                                target: "javascript:app.page.upload_app();",
                                                button: ["tool", "sm"],
                                                color: "primary"
                                            }
                                        ]
                                    },
                                    content: {
                                        type: "table",
                                        border: false,
                                        header: [
                                            {content: "Name"},
                                            {content: "Title"},
                                            {content: "Version"},
                                            {content: "Size"},
                                            {width: "10px"},
                                            {width: "10px"},
                                            {width: "10px"}
                                        ],
                                        content: []
                                    }
                                }
                            }
                        ]
                    }
                ]
            ]
        };

        if (typeof this.apps === "undefined" || this.apps === null) {
            content.content[0][0].content[0].content.content.content = [];
            content.content[0][0].content[0].content.overlay = {
                type: "icon",
                content: {
                    icon: "circle-notch",
                    big: true,
                    spin: true
                }
            };
        } else {
            let app_list = [];
            for (let i = 0; i < this.apps.length; i++) {
                let app = this.apps[i];
                app_list.push([
                    {content: app.name},
                    {content: app.title},
                    {content: app.version},
                    {content: Math.round(app.size / 1000) + " KB"},
                    {
                        element: {
                            type: "link",
                            icon: "play",
                            target: "javascript:app.page.run_app(" + i + ");",
                            button: ["sm"],
                            color: "success"
                        }
                    },
                    {
                        element: {
                            type: "link",
                            icon: "download",
                            target: "javascript:app.page.download_app(" + i + ");",
                            button: ["sm"],
                            color: "secondary"
                        }
                    },
                    {
                        element: {
                            type: "link",
                            icon: "times",
                            target: "javascript:app.page.remove_app(" + i + ");",
                            button: ["sm"],
                            color: "danger"
                        }
                    }
                ]);
            }
            content.content[0][0].content[0].content.content.content = app_list;
        }

        app.renderer.render_content(content);
    }

    on_badge_connected() {
        this.get_apps();
        this.render();
    }

    on_badge_disconnected() {
        this.get_apps();
        this.render();
    }

    async run_app(index) {
        let badge_app = this.apps[index];
        try {
            let data = await app.badge.app_run(badge_app.name);
        } catch (error) {
            console.error(error);
            app.show_message("Failed to start app", ("message" in error) ? error.message : "An error occured");
        }
    }

    _download(name, data) {
        const link = document.createElement( 'a' );
        link.style.display = 'none';
        document.body.appendChild( link );
        const blob = new Blob( [ data ], { type: 'text/plain' } );
        const objectURL = URL.createObjectURL( blob );
        link.href = objectURL;
        link.href = URL.createObjectURL( blob );
        link.download =  name + '.bin';
        link.click();
    }

    async download_app(index) {
        let badge_app = this.apps[index];
        app.show_loading("Downloading...", "This will take a while");
        try {
            let data = await app.badge.app_read(badge_app.name);
            app.hide_loading();
            this._download(badge_app.name, data);
        } catch (error) {
            console.error(error);
            app.hide_loading();
            app.show_message("Failed to download app", ("message" in error) ? error.message : "An error occured");
        }
        this.get_apps();
    }

    async remove_app(index) {
        let badge_app = this.apps[index];
        app.show_loading("Removing...");
        try {
            let result = await app.badge.app_remove(badge_app.name);
            app.hide_loading();
            if (result) {
                app.show_message("App removed", "App '" + badge_app.name + "' has been removed");
            } else {
                app.show_message("Failed to remove app", "App '" + badge_app.name + "' could not be removed");
            }
        } catch (error) {
            console.error(error);
            app.hide_loading();
            app.show_message("Failed to remove app", ("message" in error) ? error.message : "An error occured");
        }
        this.get_apps();
    }

    upload_app() {
        let id = "upload_dialog";
        let content = {
            id: "upload_dialog",
            fade: true,
            header: {
                content: [
                    {
                        type: "title",
                        card: true,
                        content: "Install an application"
                    }
                ]
            },
            form: {
                id: "login_dialog_form",
                target: "javascript:app.page.upload_app_submit();"
            },
            content: [
                {
                    type: "form-group",
                    label: "Name",
                    content: {
                        type: "input-group",
                        content: [
                            {
                                type: "input-prepend",
                                content: {
                                    icon: "stream"
                                }
                            },
                            {
                                type: "input",
                                content: {
                                    type: "text",
                                    placeholder: "Name",
                                    value: "",
                                    id: "app_upload_name"
                                }
                            }
                        ]
                    }
                },
                {
                    type: "form-group",
                    label: "Title",
                    content: {
                        type: "input-group",
                        content: [
                            {
                                type: "input-prepend",
                                content: {
                                    icon: "stream"
                                }
                            },
                            {
                                type: "input",
                                content: {
                                    type: "text",
                                    placeholder: "Title",
                                    value: "",
                                    id: "app_upload_title"
                                }
                            }
                        ]
                    }
                },
                {
                    type: "form-group",
                    label: "Version",
                    content: {
                        type: "input-group",
                        content: [
                            {
                                type: "input-prepend",
                                content: {
                                    icon: "stream"
                                }
                            },
                            {
                                type: "input",
                                content: {
                                    type: "text",
                                    placeholder: "Version",
                                    value: "",
                                    id: "app_upload_version"
                                }
                            }
                        ]
                    }
                },
                {
                    type: "form-group",
                    label: "Binary",
                    content: {
                        type: "input-group",
                        content: [
                            {
                                type: "input-prepend",
                                content: {
                                    icon: "stream"
                                }
                            },
                            {
                                type: "input",
                                content: {
                                    type: "file",
                                    placeholder: "Binary",
                                    value: "",
                                    id: "app_upload_binary"
                                }
                            }
                        ]
                    }
                },
            ],
            footer: {
                content: [,
                    {
                        type: "button",
                        target: "app.renderer.modal_remove('upload_dialog');",
                        label: "Cancel",
                        color: "secondary"
                    },
                    {
                        type: "button",
                        submit: true,
                        label: "Install",
                        color: "primary"
                    }
                ]
            }
        };

        app.renderer.modal_add(content);
        app.renderer.modal_show(content.id);
    }

    upload_file_progress_callback(message, percentage) {
        app.show_loading("Installing application...", message + " " + percentage + "%");
    }

    async upload_app_submit() {
        app.renderer.modal_remove('upload_dialog');
        let name = document.getElementById("app_upload_name").value;
        let title = document.getElementById("app_upload_title").value;
        let version = Number(document.getElementById("app_upload_version").value);
        let binary_elem = document.getElementById("app_upload_binary");

        if (binary_elem.files.length !== 1) {
            app.show_message("Failed to install app", "No binary selected");
            return;
        }

        let reader = new FileReader();
        reader.onload = async () => {
            let binary = reader.result;
            console.log("binary", binary);
            try {
                let result = await app.badge.app_write(name, title, version, binary, this.upload_file_progress_callback);
                app.hide_loading();
                if (result) {
                    app.show_message("App installed", "App '" + name + "' has been installed");
                } else {
                    app.show_message("Failed to install app", "App '" + name + "' could not be installed");
                }
            } catch (error) {
                console.error(error);
                app.hide_loading();
                app.show_message("Failed to install app", ("message" in error) ? error.message : "An error occured");
            }
            this.get_apps();
        }

        reader.readAsArrayBuffer(binary_elem.files[0]);
    }
}
