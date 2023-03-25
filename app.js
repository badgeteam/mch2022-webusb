'use strict';

var app = null;

function start_app() {
    app = new App();
}

window.onload = () => {
    start_app();
};

class App {
    constructor() {
        this.renderer = new Renderer();
        
        // Basic layout without content
        this.page_content = {
            navbar: {},
            sidebar: {},
            footer: {
                content: [
                    {
                        type: "strong",
                        content: "BADGE.TEAM"
                    },
                    "MCH2022 badge"
                ]
            }
        };
        
        this.renderer.render_loading("Starting application...", "secondary", true);

        if (typeof navigator.usb === "undefined") {
            this.show_incompatible();
            return;
        }

        this.badge = new Badge();
        this.badge.setOnConnectionLostCallback(this.on_badge_connection_lost.bind(this));
        this.badge.setOnDisconnectCallback(this.on_badge_disconnect.bind(this));
        
        this.navigation_target = "home";
        this.page = null;

        this.update_menu();

        setTimeout(() => {
            this.renderer.render(this.page_content);
            this.renderer.render_loading(null);
            this.navigate("home");
        }, 1);
    }

    show_incompatible() {
        this.renderer.render(this.page_content);
        let id = "incompatible";
        let content = {
            id: id,
            fade: true,
            header: {
                content: [
                    {
                        type: "title",
                        card: true,
                        content: "Browser incompatible"
                    }
                ]
            },
            content: [
                {
                    type: "paragraph",
                    content: "This application is not compatible with your browser. Please use a browser that has support for WebUSB."
                },
            ],
        };

        this.renderer.modal_add(content);
        this.renderer.modal_show(id);
    }

    show_loading(title, text = null) {
        let id = "loading_message";
        let content = {
            id: id,
            fade: true,
            header: {
                content: [
                    {
                        type: "title",
                        card: true,
                        content: title
                    }
                ]
            },
            content: []
        };

        if (text !== null) {
            content.content.push({
                type: "paragraph",
                content: text
            });
        }

        this.renderer.modal_add(content);
        this.renderer.modal_show(id);
    }

    hide_loading() {
        let id = "loading_message";
        this.renderer.modal_remove(id);
    }

    show_message(title, text) {
        let id = "message-" + Math.random().toString(36).substring(2);
        let content = {
            id: id,
            fade: true,
            header: {
                content: [
                    {
                        type: "title",
                        card: true,
                        content: title
                    }
                ]
            },
            content: [
                {
                    type: "paragraph",
                    content: text
                },
            ],
            footer: {
                justify_right: true,
                content: [
                    {
                        type: "button",
                        target: "app.renderer.modal_remove('" + id + "');",
                        label: "OK",
                        color: "primary"
                    }
                ]
            }
        };

        this.renderer.modal_add(content);
        this.renderer.modal_show(id);
    }

    navigate(target = this.navigation_target, force = false) {
        this.navigation_target = target;

        if (this.page !== null) {
            if (!this.page.destructor(force)) {
                return; // Current page signals that it is not ready to be navigated away from
            }
        }

        if (target === "home") {
            this.page = new Home();
        } else if (target === "apps") {
            this.page = new Apps();
        } else if (target === "files") {
            this.page = new Files();
        } else if (target === "configuration") {
            this.page = new Configuration();
        } else {
            console.error("Invalid navigation target", target);
        }

        this.update_menu();
    }
    
    on_form_submit(event) {
        console.log("Form submitted: " + event.srcElement.id);
        let input = document.getElementById(event.srcElement.id + "-input");
        if (input !== null) {
            alert("Form submitted: " + event.srcElement.id + ", value: " + input.value);
        } else {
            alert("Form submitted: " + event.srcElement.id);
        }
    }

    login_dialog() {
        let id = "login_dialog";
        
        let user = null;
        if (user !== null) {
            let content = {
                id: id,
                fade: true,
                header: {
                    content: [
                        {
                            type: "title",
                            card: true,
                            content: "Signed in"
                        }
                    ]
                },
                content: [
                    {
                        type: "paragraph",
                        content: "You are currently signed in as " + user.full_name
                    },
                ],
                footer: {
                    content: [,
                        {
                            type: "button",
                            target: "app.renderer.modal_remove(\"login_dialog\");",
                            label: "Close",
                            color: "secondary"
                        },
                        {
                            type: "button",
                            target: "app.renderer.modal_remove(\"login_dialog\");",
                            label: "Sign out",
                            color: "primary"
                        }
                    ]
                }
            };

            this.renderer.modal_add(content);
            this.renderer.modal_show(id);
            return;
        }

        let content = {
            id: "login_dialog",
            fade: true,
            header: {
                content: [
                    {
                        type: "title",
                        card: true,
                        content: "Sign in to your account"
                    }
                ]
            },
            form: {
                id: "login_dialog_form",
                target: "javascript:app.login_dialog_submit();"
            },
            content: [
                {
                    type: "form-group",
                    label: "Username",
                    content: {
                        type: "input-group",
                        content: [
                            {
                                type: "input-prepend",
                                content: {
                                    icon: "user"
                                }
                            },
                            {
                                type: "input",
                                content: {
                                    type: "text",
                                    placeholder: "Username",
                                    value: "",
                                    id: "login_dialog_username"
                                }
                            }
                        ]
                    }
                },
                {
                    type: "form-group",
                    label: "Password",
                    content: {
                        type: "input-group",
                        content: [
                            {
                                type: "input-prepend",
                                content: {
                                    icon: "key"
                                }
                            },
                            {
                                type: "input",
                                content: {
                                    type: "password",
                                    placeholder: "Password",
                                    value: "",
                                    id: "login_dialog_password"
                                }
                            }
                        ]
                    }
                },
                /*{
                    type: "form-group",
                    //label: "Remember me",
                    content: {
                        type: "input",
                        content: {
                            type: "checkbox",
                            value: true,
                            id: "login_dialog_remember",
                            label: "Remember me"
                        }
                    }
                },*/
            ],
            footer: {
                content: [,
                    {
                        type: "button",
                        target: "app.renderer.modal_remove(\"login_dialog\");",
                        label: "Cancel",
                        color: "secondary"
                    },
                    {
                        type: "button",
                        submit: true,
                        label: "Sign in",
                        color: "primary"
                    }
                ]
            }
        };

        this.renderer.modal_add(content);
        this.renderer.modal_show(content.id);
    }
    
    login_dialog_submit() {
        let username = document.getElementById("login_dialog_username").value;
        let password = document.getElementById("login_dialog_password").value;

        console.log("login_dialog_submit", username, password);
    }
    
    update_menu() {
        let connection_status = {
            avatar: "images/disconnected.svg",
            name: "Disconnected",
            title: "Click here to connect",
            action: "javascript:app.badge_connect();"
        };

        if (this.badge.is_connected()) {
            connection_status = {
                avatar: "images/connected.svg",
                name: this.badge.getProductName(),
                title: this.badge.getSerialNumber(),
                action: "javascript:app.badge_disconnect();"
            };
        }

        let content = Object.assign(this.page_content.sidebar, {
            user: connection_status,
            items: [
                {
                    label: "Information",
                    icon: "home",
                    target: "javascript:app.navigate('home');",
                    active: (this.page instanceof Home)
                },
                {
                    label: "Apps",
                    icon: "box",
                    target: "javascript:app.navigate('apps');",
                    active: (this.page instanceof Apps),
                    disabled: true
                },
                {
                    label: "Files",
                    icon: "file",
                    target: "javascript:app.navigate('files');",
                    active: (this.page instanceof Files)
                },
                {
                    label: "Configuration",
                    icon: "cog",
                    target: "javascript:app.navigate('configuration');",
                    active: (this.page instanceof Configuration)
                }
            ]
        });

        this.renderer.render_sidebar(content);
    }

    on_badge_connection_lost() {
        console.log("Badge on_connection_lost");
    }

    on_badge_disconnect() {
        this.update_menu();
        if (typeof this.page.on_badge_disconnected === "function") {
            this.page.on_badge_disconnected();
        }
    }

    async badge_connect() {
        try {
            this.show_loading("Connecting...");
            await this.badge.connect();
            this.hide_loading();
            this.update_menu();
            if (typeof this.page.on_badge_connected === "function") {
                this.page.on_badge_connected();
            }
        } catch (error) {
            console.error(error);
            this.hide_loading();
            this.show_message("Failed to connect", ("message" in error) ? error.message : "An error occured");
        }
    }

    async badge_disconnect() {
        try {
            await this.badge.disconnect();
        } catch (error) {
            console.error(error);
            this.show_message("Failed to disconnect", ("message" in error) ? error.message : "An error occured");
        }
    }
}
