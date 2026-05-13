use gemstone_gci::{
    char_from_oop, char_to_oop, i64_to_smallint, is_char, is_smallint, smallint_to_i64,
    GciErrSType, GciLibrary, RawOop, GCI_ENCRYPT_BUF_SIZE, OOP_FALSE, OOP_NIL, OOP_TRUE,
};
use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::ffi::{CStr, CString};
use std::path::PathBuf;

#[napi(object)]
pub struct LoginOptions {
    pub username: String,
    pub password: String,
    pub flags: Option<u32>,
    pub halt_on_error: Option<bool>,
}

#[napi(object)]
pub struct GciErrorInfo {
    pub number: i32,
    pub fatal: bool,
    pub message: String,
    pub reason: Option<String>,
}

#[napi(object)]
pub struct SymDictLookup {
    pub value: String,
    pub assoc: String,
}

#[napi]
pub struct Gci {
    lib: GciLibrary,
}

#[napi]
impl Gci {
    #[napi(constructor)]
    pub fn new(lib_path: Option<String>) -> Result<Self> {
        let path = lib_path.map(PathBuf::from);
        let lib = GciLibrary::load(path).map_err(to_napi_error)?;
        Ok(Self { lib })
    }

    #[napi]
    pub fn init(&self, _lib_path: Option<String>) -> Result<i32> {
        unsafe { self.lib.gci_init().map_err(to_napi_error) }
    }

    #[napi(js_name = "libraryPath")]
    pub fn library_path(&self) -> String {
        self.lib.path().display().to_string()
    }

    #[napi]
    pub fn encrypt(&self, password: String) -> Result<String> {
        let password = cstring(password)?;
        let mut buffer = vec![0_i8; GCI_ENCRYPT_BUF_SIZE];
        unsafe {
            self.lib
                .gci_encrypt(&password, buffer.as_mut_ptr(), GCI_ENCRYPT_BUF_SIZE as u32)
                .map_err(to_napi_error)?;
            Ok(CStr::from_ptr(buffer.as_ptr())
                .to_string_lossy()
                .into_owned())
        }
    }

    #[napi(js_name = "setNet")]
    pub fn set_net(
        &self,
        stone_name: String,
        host_username: String,
        encrypted_host_password: String,
        gem_service: String,
    ) -> Result<()> {
        let stone_name = cstring(stone_name)?;
        let host_username = cstring(host_username)?;
        let encrypted_host_password = cstring(encrypted_host_password)?;
        let gem_service = cstring(gem_service)?;
        unsafe {
            self.lib
                .gci_set_net(
                    &stone_name,
                    &host_username,
                    encrypted_host_password.as_ptr(),
                    &gem_service,
                )
                .map_err(to_napi_error)
        }
    }

    #[napi(js_name = "loginEx")]
    pub fn login_ex(&self, options: LoginOptions) -> Result<i32> {
        let username = cstring(options.username)?;
        let password = cstring(options.password)?;
        unsafe {
            self.lib
                .gci_login_ex(
                    &username,
                    &password,
                    options.flags.unwrap_or(0),
                    if options.halt_on_error.unwrap_or(false) {
                        1
                    } else {
                        0
                    },
                )
                .map_err(to_napi_error)
        }
    }

    #[napi]
    pub fn logout(&self) -> Result<i32> {
        unsafe { self.lib.gci_logout().map_err(to_napi_error) }
    }

    #[napi]
    pub fn commit(&self) -> Result<bool> {
        let mut err = GciErrSType::default();
        unsafe {
            self.lib
                .gci_commit(&mut err)
                .map(|ok| ok != 0)
                .map_err(to_napi_error)
        }
    }

    #[napi]
    pub fn abort(&self) -> Result<bool> {
        let mut err = GciErrSType::default();
        unsafe {
            self.lib
                .gci_abort(&mut err)
                .map(|ok| ok != 0)
                .map_err(to_napi_error)
        }
    }

    #[napi]
    pub fn err(&self) -> Result<Option<GciErrorInfo>> {
        let mut err = GciErrSType::default();
        let ok = unsafe { self.lib.gci_err(&mut err).map_err(to_napi_error)? };
        if ok == 0 && err.number == 0 {
            return Ok(None);
        }
        let message = err.message_text();
        let reason = err.reason_text();
        Ok(Some(GciErrorInfo {
            number: err.number,
            fatal: err.fatal != 0,
            message,
            reason: if reason.is_empty() {
                None
            } else {
                Some(reason)
            },
        }))
    }

    #[napi(js_name = "executeStr")]
    pub fn execute_str(&self, source: String, receiver: Option<String>) -> Result<String> {
        let source = cstring(source)?;
        let receiver = receiver.map(parse_oop).transpose()?.unwrap_or(OOP_NIL);
        unsafe {
            self.lib
                .gci_execute_str(&source, receiver)
                .map(oop_string)
                .map_err(to_napi_error)
        }
    }

    #[napi]
    pub fn perform(
        &self,
        receiver: String,
        selector: String,
        args: Option<Vec<String>>,
    ) -> Result<String> {
        let receiver = parse_oop(receiver)?;
        let selector = cstring(selector)?;
        let args: Vec<RawOop> = args
            .unwrap_or_default()
            .into_iter()
            .map(parse_oop)
            .collect::<Result<Vec<_>>>()?;
        unsafe {
            self.lib
                .gci_perform(receiver, &selector, args.as_ptr(), args.len() as i32)
                .map(oop_string)
                .map_err(to_napi_error)
        }
    }

    #[napi(js_name = "newString")]
    pub fn new_string(&self, value: String) -> Result<String> {
        let value = cstring(value)?;
        unsafe {
            self.lib
                .gci_new_string(&value)
                .map(oop_string)
                .map_err(to_napi_error)
        }
    }

    #[napi(js_name = "newSymbol")]
    pub fn new_symbol(&self, value: String) -> Result<String> {
        let value = cstring(value)?;
        unsafe {
            self.lib
                .gci_new_symbol(&value)
                .map(oop_string)
                .map_err(to_napi_error)
        }
    }

    #[napi(js_name = "newOop")]
    pub fn new_oop(&self, class_oop: String) -> Result<String> {
        unsafe {
            self.lib
                .gci_new_oop(parse_oop(class_oop)?)
                .map(oop_string)
                .map_err(to_napi_error)
        }
    }

    #[napi(js_name = "resolveSymbol")]
    pub fn resolve_symbol(&self, name: String, symbol_list: Option<String>) -> Result<String> {
        let name = cstring(name)?;
        let symbol_list = symbol_list.map(parse_oop).transpose()?.unwrap_or(OOP_NIL);
        unsafe {
            self.lib
                .gci_resolve_symbol(&name, symbol_list)
                .map(oop_string)
                .map_err(to_napi_error)
        }
    }

    #[napi(js_name = "fetchClass")]
    pub fn fetch_class(&self, oop: String) -> Result<String> {
        unsafe {
            self.lib
                .gci_fetch_class(parse_oop(oop)?)
                .map(oop_string)
                .map_err(to_napi_error)
        }
    }

    #[napi(js_name = "fetchSize")]
    pub fn fetch_size(&self, oop: String) -> Result<i64> {
        unsafe {
            self.lib
                .gci_fetch_size(parse_oop(oop)?)
                .map_err(to_napi_error)
        }
    }

    #[napi(js_name = "fetchBytes")]
    pub fn fetch_bytes(&self, oop: String, start: i64, count: i64) -> Result<Buffer> {
        let count = fetch_count_to_usize(count)?;
        let mut bytes = vec![0_u8; count];
        let read = unsafe {
            self.lib
                .gci_fetch_bytes(
                    parse_oop(oop)?,
                    start,
                    bytes.as_mut_ptr().cast(),
                    count as i64,
                )
                .map_err(to_napi_error)?
        };
        if read < 0 {
            return Err(Error::from_reason(format!(
                "GciFetchBytes_ returned negative byte count {read}."
            )));
        }
        bytes.truncate((read as usize).min(bytes.len()));
        Ok(Buffer::from(bytes))
    }

    #[napi(js_name = "getSessionId")]
    pub fn get_session_id(&self) -> Result<i32> {
        unsafe { self.lib.gci_get_session_id().map_err(to_napi_error) }
    }

    #[napi(js_name = "setSessionId")]
    pub fn set_session_id(&self, session_id: i32) -> Result<()> {
        unsafe {
            self.lib
                .gci_set_session_id(session_id)
                .map_err(to_napi_error)
        }
    }

    #[napi(js_name = "needsCommit")]
    pub fn needs_commit(&self) -> Result<bool> {
        unsafe {
            self.lib
                .gci_needs_commit()
                .map(|ok| ok != 0)
                .map_err(to_napi_error)
        }
    }

    #[napi(js_name = "inTransaction")]
    pub fn in_transaction(&self) -> Result<bool> {
        unsafe {
            self.lib
                .gci_in_transaction()
                .map(|ok| ok != 0)
                .map_err(to_napi_error)
        }
    }

    #[napi(js_name = "fltToOop")]
    pub fn flt_to_oop(&self, value: f64) -> Result<String> {
        unsafe {
            self.lib
                .gci_flt_to_oop(value)
                .map(oop_string)
                .map_err(to_napi_error)
        }
    }

    #[napi(js_name = "oopToFlt")]
    pub fn oop_to_flt(&self, oop: String) -> Result<f64> {
        let mut value = 0.0_f64;
        let ok = unsafe {
            self.lib
                .gci_oop_to_flt(parse_oop(oop)?, &mut value)
                .map_err(to_napi_error)?
        };
        if ok == 0 {
            return Err(Error::from_reason("OOP cannot be converted to Float."));
        }
        Ok(value)
    }

    #[napi(js_name = "symDictAt")]
    pub fn sym_dict_at(&self, dict: String, key: String) -> Result<SymDictLookup> {
        let dict = parse_oop(dict)?;
        let key = cstring(key)?;
        let mut value = 0;
        let mut assoc = 0;
        unsafe {
            self.lib
                .gci_sym_dict_at(dict, &key, &mut value, &mut assoc)
                .map_err(to_napi_error)?;
        }
        Ok(SymDictLookup {
            value: oop_string(value),
            assoc: oop_string(assoc),
        })
    }

    #[napi(js_name = "symDictAtPut")]
    pub fn sym_dict_at_put(&self, dict: String, key: String, value: String) -> Result<()> {
        let dict = parse_oop(dict)?;
        let key = cstring(key)?;
        let value = parse_oop(value)?;
        unsafe {
            self.lib
                .gci_sym_dict_at_put(dict, &key, value)
                .map_err(to_napi_error)
        }
    }

    #[napi(js_name = "symDictAtObjPut")]
    pub fn sym_dict_at_obj_put(&self, dict: String, key: String, value: String) -> Result<()> {
        unsafe {
            self.lib
                .gci_sym_dict_at_obj_put(parse_oop(dict)?, parse_oop(key)?, parse_oop(value)?)
                .map_err(to_napi_error)
        }
    }

    #[napi(js_name = "strKeyValueDictAt")]
    pub fn str_key_value_dict_at(&self, dict: String, key: String) -> Result<String> {
        let dict = parse_oop(dict)?;
        let key = cstring(key)?;
        let mut value = 0;
        unsafe {
            self.lib
                .gci_str_key_value_dict_at(dict, &key, &mut value)
                .map_err(to_napi_error)?;
        }
        Ok(oop_string(value))
    }

    #[napi(js_name = "strKeyValueDictAtPut")]
    pub fn str_key_value_dict_at_put(
        &self,
        dict: String,
        key: String,
        value: String,
    ) -> Result<()> {
        let dict = parse_oop(dict)?;
        let key = cstring(key)?;
        let value = parse_oop(value)?;
        unsafe {
            self.lib
                .gci_str_key_value_dict_at_put(dict, &key, value)
                .map_err(to_napi_error)
        }
    }

    #[napi(js_name = "addOopToExportSet")]
    pub fn add_oop_to_export_set(&self, oop: String) -> Result<()> {
        self.call_optional_export_set(
            &[
                b"GciAddOopToExportSet" as &[u8],
                b"GciAddObjToExportSet" as &[u8],
            ],
            parse_oop(oop)?,
        )
    }

    #[napi(js_name = "removeOopFromExportSet")]
    pub fn remove_oop_from_export_set(&self, oop: String) -> Result<()> {
        self.call_optional_export_set(
            &[
                b"GciRemoveOopFromExportSet" as &[u8],
                b"GciRemoveObjFromExportSet" as &[u8],
            ],
            parse_oop(oop)?,
        )
    }

    fn call_optional_export_set(&self, names: &[&[u8]], oop: RawOop) -> Result<()> {
        for name in names {
            let called = unsafe {
                self.lib
                    .call_optional_oop_export(name, oop)
                    .map_err(to_napi_error)?
            };
            if called {
                return Ok(());
            }
        }
        Ok(())
    }
}

#[napi(js_name = "smallintToOop")]
pub fn smallint_to_oop(value: i64) -> String {
    oop_string(i64_to_smallint(value))
}

#[napi(js_name = "oopToSmallint")]
pub fn oop_to_smallint(value: String) -> Result<i64> {
    let oop = parse_oop(value)?;
    if !is_smallint(oop) {
        return Err(Error::from_reason("OOP is not a SmallInteger."));
    }
    Ok(smallint_to_i64(oop))
}

#[napi(js_name = "isSmallintOop")]
pub fn is_smallint_oop(value: String) -> Result<bool> {
    Ok(is_smallint(parse_oop(value)?))
}

#[napi(js_name = "boolToOop")]
pub fn bool_to_oop(value: bool) -> String {
    oop_string(if value { OOP_TRUE } else { OOP_FALSE })
}

#[napi(js_name = "charToOopString")]
pub fn char_to_oop_string(value: String) -> Result<String> {
    let mut chars = value.chars();
    let Some(ch) = chars.next() else {
        return Err(Error::from_reason("Expected exactly one character."));
    };
    if chars.next().is_some() {
        return Err(Error::from_reason("Expected exactly one character."));
    }
    Ok(oop_string(char_to_oop(ch)))
}

#[napi(js_name = "oopToCharString")]
pub fn oop_to_char_string(value: String) -> Result<Option<String>> {
    let oop = parse_oop(value)?;
    if !is_char(oop) {
        return Ok(None);
    }
    Ok(Some(char_from_oop(oop).map_err(to_napi_error)?.to_string()))
}

fn cstring(value: String) -> Result<CString> {
    CString::new(value).map_err(|_| Error::from_reason("String contains an interior NUL byte."))
}

fn parse_oop(value: String) -> Result<RawOop> {
    value
        .parse::<RawOop>()
        .map_err(|error| Error::from_reason(format!("Invalid OOP value {value:?}: {error}")))
}

fn oop_string(value: RawOop) -> String {
    value.to_string()
}

fn fetch_count_to_usize(count: i64) -> Result<usize> {
    if count < 0 {
        return Err(Error::from_reason("fetchBytes count must be non-negative."));
    }
    Ok(count as usize)
}

fn to_napi_error(error: impl std::fmt::Display) -> Error {
    Error::from_reason(error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use gemstone_gci::{char_to_oop, i64_to_smallint};

    #[test]
    fn parse_oop_accepts_decimal_u64_values() {
        assert_eq!(parse_oop("20".to_string()).unwrap(), OOP_NIL);
        assert_eq!(
            parse_oop(i64_to_smallint(-7).to_string()).unwrap(),
            i64_to_smallint(-7)
        );
    }

    #[test]
    fn parse_oop_rejects_non_decimal_values() {
        assert!(parse_oop("0x14".to_string()).is_err());
        assert!(parse_oop("not-an-oop".to_string()).is_err());
    }

    #[test]
    fn cstring_rejects_interior_nul() {
        assert!(cstring("abc\0def".to_string()).is_err());
    }

    #[test]
    fn oop_string_returns_decimal_wire_format() {
        assert_eq!(oop_string(OOP_TRUE), "268");
        assert_eq!(oop_string(char_to_oop('A')), "16668");
    }

    #[test]
    fn fetch_count_validation_rejects_negative_counts() {
        assert_eq!(fetch_count_to_usize(0).unwrap(), 0);
        assert_eq!(fetch_count_to_usize(16).unwrap(), 16);
        assert!(fetch_count_to_usize(-1).is_err());
    }
}
