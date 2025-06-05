var elem = document.getElementById("toggle-password");
var icon = document.getElementById("icon-pass");
elem.addEventListener("click", () => {
    let passField = document.getElementById("password");
    if(passField.type == "password"){
        passField.type = "text";
        icon.className = "bi bi-eye toggle-icon";
    }else{
        passField.type = "password";
        icon.className = "bi bi-eye-slash toggle-icon"
    }
})