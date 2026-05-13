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

#[derive(Clone, Debug, Eq, PartialEq)]
#[napi(object)]
pub struct GciErrorInfo {
    pub number: i32,
    pub fatal: bool,
    pub message: String,
    pub reason: Option<String>,
    pub category: String,
    pub context: String,
    pub exception_obj: String,
    pub args: Vec<String>,
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
        Ok(Some(gci_error_info(err)))
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
        let argc = perform_arg_count(args.len())?;
        unsafe {
            self.lib
                .gci_perform(receiver, &selector, args.as_ptr(), argc)
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
        let start = validate_fetch_start(start)?;
        let buffer_len = fetch_count_to_usize(count)?;
        let mut bytes = vec![0_u8; buffer_len];
        let read = unsafe {
            self.lib
                .gci_fetch_bytes(parse_oop(oop)?, start, bytes.as_mut_ptr().cast(), count)
                .map_err(to_napi_error)?
        };
        bytes.truncate(fetch_read_to_truncate_len(read, bytes.len())?);
        Ok(Buffer::from(bytes))
    }

    #[napi(js_name = "getSessionId")]
    pub fn get_session_id(&self) -> Result<i32> {
        unsafe { self.lib.gci_get_session_id().map_err(to_napi_error) }
    }

    #[napi(js_name = "setSessionId")]
    pub fn set_session_id(&self, session_id: i32) -> Result<()> {
        let session_id = validate_session_id(session_id)?;
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
        let value = validate_finite_float(value)?;
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

#[cfg(feature = "session-thread-spike")]
pub struct ExperimentalGciThreadWorker {
    sender: std::sync::mpsc::Sender<GciThreadCommand>,
    join: Option<std::thread::JoinHandle<()>>,
}

#[cfg(feature = "session-thread-spike")]
impl ExperimentalGciThreadWorker {
    pub fn start(lib: GciLibrary) -> Result<Self> {
        Self::spawn(GciThreadState::Live(lib))
    }

    pub fn library_path(&self) -> Result<String> {
        self.request_string(GciThreadCommand::LibraryPath)
    }

    pub fn fetch_size(&self, oop: RawOop) -> Result<i64> {
        let (reply, receiver) = std::sync::mpsc::channel();
        self.sender
            .send(GciThreadCommand::FetchSize(oop, reply))
            .map_err(|_| Error::from_reason("Experimental GCI worker thread is closed."))?;
        receiver
            .recv()
            .map_err(|_| {
                Error::from_reason("Experimental GCI worker thread closed before replying.")
            })?
            .map_err(Error::from_reason)
    }

    pub fn fetch_class(&self, oop: RawOop) -> Result<RawOop> {
        let (reply, receiver) = std::sync::mpsc::channel();
        self.sender
            .send(GciThreadCommand::FetchClass(oop, reply))
            .map_err(|_| Error::from_reason("Experimental GCI worker thread is closed."))?;
        receiver
            .recv()
            .map_err(|_| {
                Error::from_reason("Experimental GCI worker thread closed before replying.")
            })?
            .map_err(Error::from_reason)
    }

    pub fn execute_str(&self, source: String, receiver_oop: RawOop) -> Result<RawOop> {
        let (reply, receiver) = std::sync::mpsc::channel();
        self.sender
            .send(GciThreadCommand::ExecuteStr(source, receiver_oop, reply))
            .map_err(|_| Error::from_reason("Experimental GCI worker thread is closed."))?;
        receiver
            .recv()
            .map_err(|_| {
                Error::from_reason("Experimental GCI worker thread closed before replying.")
            })?
            .map_err(Error::from_reason)
    }

    pub fn perform(
        &self,
        receiver_oop: RawOop,
        selector: String,
        args: Vec<RawOop>,
    ) -> Result<RawOop> {
        let (reply, receiver) = std::sync::mpsc::channel();
        self.sender
            .send(GciThreadCommand::Perform(
                receiver_oop,
                selector,
                args,
                reply,
            ))
            .map_err(|_| Error::from_reason("Experimental GCI worker thread is closed."))?;
        receiver
            .recv()
            .map_err(|_| {
                Error::from_reason("Experimental GCI worker thread closed before replying.")
            })?
            .map_err(Error::from_reason)
    }

    pub fn err(&self) -> Result<Option<GciErrorInfo>> {
        let (reply, receiver) = std::sync::mpsc::channel();
        self.sender
            .send(GciThreadCommand::Err(reply))
            .map_err(|_| Error::from_reason("Experimental GCI worker thread is closed."))?;
        receiver
            .recv()
            .map_err(|_| {
                Error::from_reason("Experimental GCI worker thread closed before replying.")
            })?
            .map_err(Error::from_reason)
    }

    #[cfg(test)]
    fn start_for_path_with_readbacks(
        path: PathBuf,
        sizes: impl IntoIterator<Item = (RawOop, i64)>,
        classes: impl IntoIterator<Item = (RawOop, RawOop)>,
        executions: impl IntoIterator<Item = ((String, RawOop), RawOop)>,
        performs: impl IntoIterator<Item = ((RawOop, String, Vec<RawOop>), RawOop)>,
        err_info: Option<GciErrorInfo>,
    ) -> Result<Self> {
        Self::spawn(GciThreadState::PathOnly {
            path,
            sizes: sizes.into_iter().collect(),
            classes: classes.into_iter().collect(),
            executions: executions.into_iter().collect(),
            performs: performs.into_iter().collect(),
            err_info,
        })
    }

    #[cfg(test)]
    fn worker_thread_id_debug(&self) -> Result<String> {
        self.request_string(GciThreadCommand::ThreadId)
    }

    fn spawn(state: GciThreadState) -> Result<Self> {
        let (sender, receiver) = std::sync::mpsc::channel();
        let join = std::thread::Builder::new()
            .name("gemstone-js-gci-session-spike".to_string())
            .spawn(move || {
                while let Ok(command) = receiver.recv() {
                    match command {
                        GciThreadCommand::LibraryPath(reply) => {
                            let _ = reply.send(state.library_path());
                        }
                        GciThreadCommand::FetchSize(oop, reply) => {
                            let _ = reply.send(state.fetch_size(oop));
                        }
                        GciThreadCommand::FetchClass(oop, reply) => {
                            let _ = reply.send(state.fetch_class(oop));
                        }
                        GciThreadCommand::ExecuteStr(source, receiver_oop, reply) => {
                            let _ = reply.send(state.execute_str(source, receiver_oop));
                        }
                        GciThreadCommand::Perform(receiver_oop, selector, args, reply) => {
                            let _ = reply.send(state.perform(receiver_oop, selector, args));
                        }
                        GciThreadCommand::Err(reply) => {
                            let _ = reply.send(state.err());
                        }
                        GciThreadCommand::ThreadId(reply) => {
                            let _ = reply.send(format!("{:?}", std::thread::current().id()));
                        }
                        GciThreadCommand::Shutdown => break,
                    }
                }
            })
            .map_err(|error| {
                Error::from_reason(format!(
                    "Cannot start experimental GCI worker thread: {error}"
                ))
            })?;

        Ok(Self {
            sender,
            join: Some(join),
        })
    }

    fn request_string(
        &self,
        build_command: impl FnOnce(std::sync::mpsc::Sender<String>) -> GciThreadCommand,
    ) -> Result<String> {
        let (reply, receiver) = std::sync::mpsc::channel();
        self.sender
            .send(build_command(reply))
            .map_err(|_| Error::from_reason("Experimental GCI worker thread is closed."))?;
        receiver.recv().map_err(|_| {
            Error::from_reason("Experimental GCI worker thread closed before replying.")
        })
    }
}

#[cfg(feature = "session-thread-spike")]
impl Drop for ExperimentalGciThreadWorker {
    fn drop(&mut self) {
        let _ = self.sender.send(GciThreadCommand::Shutdown);
        if let Some(join) = self.join.take() {
            let _ = join.join();
        }
    }
}

#[cfg(feature = "session-thread-spike")]
enum GciThreadState {
    Live(GciLibrary),
    #[cfg(test)]
    PathOnly {
        path: PathBuf,
        sizes: std::collections::BTreeMap<RawOop, i64>,
        classes: std::collections::BTreeMap<RawOop, RawOop>,
        executions: std::collections::BTreeMap<(String, RawOop), RawOop>,
        performs: std::collections::BTreeMap<(RawOop, String, Vec<RawOop>), RawOop>,
        err_info: Option<GciErrorInfo>,
    },
}

#[cfg(feature = "session-thread-spike")]
impl GciThreadState {
    fn library_path(&self) -> String {
        match self {
            Self::Live(lib) => lib.path().display().to_string(),
            #[cfg(test)]
            Self::PathOnly { path, .. } => path.display().to_string(),
        }
    }

    fn fetch_size(&self, oop: RawOop) -> std::result::Result<i64, String> {
        match self {
            Self::Live(lib) => unsafe {
                lib.gci_fetch_size(oop).map_err(|error| error.to_string())
            },
            #[cfg(test)]
            Self::PathOnly { sizes, .. } => sizes
                .get(&oop)
                .copied()
                .ok_or_else(|| format!("No synthetic fetchSize result for OOP {oop}.")),
        }
    }

    fn fetch_class(&self, oop: RawOop) -> std::result::Result<RawOop, String> {
        match self {
            Self::Live(lib) => unsafe {
                lib.gci_fetch_class(oop).map_err(|error| error.to_string())
            },
            #[cfg(test)]
            Self::PathOnly { classes, .. } => classes
                .get(&oop)
                .copied()
                .ok_or_else(|| format!("No synthetic fetchClass result for OOP {oop}.")),
        }
    }

    fn execute_str(
        &self,
        source: String,
        receiver_oop: RawOop,
    ) -> std::result::Result<RawOop, String> {
        match self {
            Self::Live(lib) => {
                let source = CString::new(source)
                    .map_err(|_| "executeStr source contains an interior NUL byte.".to_string())?;
                unsafe {
                    lib.gci_execute_str(&source, receiver_oop)
                        .map_err(|error| error.to_string())
                }
            }
            #[cfg(test)]
            Self::PathOnly { executions, .. } => executions
                .get(&(source.clone(), receiver_oop))
                .copied()
                .ok_or_else(|| format!("No synthetic executeStr result for source {source:?} and receiver {receiver_oop}.")),
        }
    }

    fn perform(
        &self,
        receiver_oop: RawOop,
        selector: String,
        args: Vec<RawOop>,
    ) -> std::result::Result<RawOop, String> {
        match self {
            Self::Live(lib) => {
                let selector = CString::new(selector)
                    .map_err(|_| "perform selector contains an interior NUL byte.".to_string())?;
                let argc = i32::try_from(args.len())
                    .map_err(|_| "perform arg count exceeds i32 range.".to_string())?;
                unsafe {
                    lib.gci_perform(receiver_oop, &selector, args.as_ptr(), argc)
                        .map_err(|error| error.to_string())
                }
            }
            #[cfg(test)]
            Self::PathOnly { performs, .. } => performs
                .get(&(receiver_oop, selector.clone(), args.clone()))
                .copied()
                .ok_or_else(|| {
                    format!(
                        "No synthetic perform result for receiver {receiver_oop}, selector {selector:?}, and {} args.",
                        args.len()
                    )
                }),
        }
    }

    fn err(&self) -> std::result::Result<Option<GciErrorInfo>, String> {
        match self {
            Self::Live(lib) => {
                let mut err = GciErrSType::default();
                let ok = unsafe { lib.gci_err(&mut err).map_err(|error| error.to_string())? };
                if ok == 0 && err.number == 0 {
                    Ok(None)
                } else {
                    Ok(Some(gci_error_info(err)))
                }
            }
            #[cfg(test)]
            Self::PathOnly { err_info, .. } => Ok(err_info.clone()),
        }
    }
}

#[cfg(feature = "session-thread-spike")]
enum GciThreadCommand {
    LibraryPath(std::sync::mpsc::Sender<String>),
    FetchSize(
        RawOop,
        std::sync::mpsc::Sender<std::result::Result<i64, String>>,
    ),
    FetchClass(
        RawOop,
        std::sync::mpsc::Sender<std::result::Result<RawOop, String>>,
    ),
    ExecuteStr(
        String,
        RawOop,
        std::sync::mpsc::Sender<std::result::Result<RawOop, String>>,
    ),
    Perform(
        RawOop,
        String,
        Vec<RawOop>,
        std::sync::mpsc::Sender<std::result::Result<RawOop, String>>,
    ),
    Err(std::sync::mpsc::Sender<std::result::Result<Option<GciErrorInfo>, String>>),
    ThreadId(std::sync::mpsc::Sender<String>),
    Shutdown,
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
    if value.is_empty() || !value.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err(Error::from_reason(format!(
            "Invalid OOP value {value:?}: expected unsigned decimal digits"
        )));
    }
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
    usize::try_from(count).map_err(|_| Error::from_reason("fetchBytes count exceeds usize range."))
}

fn fetch_read_to_truncate_len(read: i64, buffer_len: usize) -> Result<usize> {
    if read < 0 {
        return Err(Error::from_reason(format!(
            "GciFetchBytes_ returned negative byte count {read}."
        )));
    }
    let read = usize::try_from(read)
        .map_err(|_| Error::from_reason("GciFetchBytes_ byte count exceeds usize range."))?;
    Ok(read.min(buffer_len))
}

fn validate_fetch_start(start: i64) -> Result<i64> {
    if start < 1 {
        return Err(Error::from_reason("fetchBytes start must be positive."));
    }
    Ok(start)
}

fn validate_session_id(session_id: i32) -> Result<i32> {
    if session_id < 0 {
        return Err(Error::from_reason("session id must be non-negative."));
    }
    Ok(session_id)
}

fn validate_finite_float(value: f64) -> Result<f64> {
    if !value.is_finite() {
        return Err(Error::from_reason("Float value must be finite."));
    }
    Ok(value)
}

fn perform_arg_count(count: usize) -> Result<i32> {
    i32::try_from(count)
        .map_err(|_| Error::from_reason("perform argument count exceeds i32 range."))
}

fn gci_error_info(err: GciErrSType) -> GciErrorInfo {
    let reason = err.reason_text();
    let arg_count = usize::try_from(err.arg_count.max(0))
        .unwrap_or(0)
        .min(err.args.len());
    GciErrorInfo {
        number: err.number,
        fatal: err.fatal != 0,
        message: err.message_text(),
        reason: if reason.is_empty() {
            None
        } else {
            Some(reason)
        },
        category: oop_string(err.category),
        context: oop_string(err.context),
        exception_obj: oop_string(err.exception_obj),
        args: err.args[..arg_count]
            .iter()
            .copied()
            .map(oop_string)
            .collect(),
    }
}

fn to_napi_error(error: impl std::fmt::Display) -> Error {
    Error::from_reason(error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use gemstone_gci::{char_to_oop, i64_to_smallint};
    use std::os::raw::c_char;

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
        assert!(parse_oop(String::new()).is_err());
        assert!(parse_oop("+20".to_string()).is_err());
        assert!(parse_oop("-20".to_string()).is_err());
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
        if usize::BITS < i64::BITS {
            assert!(fetch_count_to_usize(i64::MAX).is_err());
        }
    }

    #[test]
    fn fetch_read_validation_clamps_to_buffer_size() {
        assert_eq!(fetch_read_to_truncate_len(0, 8).unwrap(), 0);
        assert_eq!(fetch_read_to_truncate_len(4, 8).unwrap(), 4);
        assert_eq!(fetch_read_to_truncate_len(12, 8).unwrap(), 8);
        assert!(fetch_read_to_truncate_len(-1, 8).is_err());
        if usize::BITS < i64::BITS {
            assert!(fetch_read_to_truncate_len(i64::MAX, 8).is_err());
        }
    }

    #[test]
    fn fetch_start_validation_rejects_non_positive_values() {
        assert_eq!(validate_fetch_start(1).unwrap(), 1);
        assert_eq!(validate_fetch_start(42).unwrap(), 42);
        assert!(validate_fetch_start(0).is_err());
        assert!(validate_fetch_start(-1).is_err());
    }

    #[test]
    fn session_id_validation_rejects_negative_values() {
        assert_eq!(validate_session_id(0).unwrap(), 0);
        assert_eq!(validate_session_id(42).unwrap(), 42);
        assert!(validate_session_id(-1).is_err());
    }

    #[test]
    fn float_validation_rejects_non_finite_values() {
        assert_eq!(validate_finite_float(3.25).unwrap(), 3.25);
        assert!(validate_finite_float(f64::NAN).is_err());
        assert!(validate_finite_float(f64::INFINITY).is_err());
        assert!(validate_finite_float(f64::NEG_INFINITY).is_err());
    }

    #[test]
    fn perform_arg_count_validation_rejects_i32_overflow() {
        assert_eq!(perform_arg_count(0).unwrap(), 0);
        assert_eq!(perform_arg_count(2).unwrap(), 2);
        assert_eq!(perform_arg_count(i32::MAX as usize).unwrap(), i32::MAX);
        assert!(perform_arg_count(i32::MAX as usize + 1).is_err());
    }

    #[test]
    fn gci_error_info_includes_oop_context_and_clamped_args() {
        let mut err = GciErrSType::default();
        err.category = 1000;
        err.context = 1001;
        err.exception_obj = 1002;
        err.args[0] = 1003;
        err.args[1] = 1004;
        err.arg_count = 99;
        err.number = 2406;
        err.fatal = 1;
        write_c_char_array(&mut err.message, "message text");
        write_c_char_array(&mut err.reason, "reason text");

        let info = gci_error_info(err);

        assert_eq!(info.number, 2406);
        assert!(info.fatal);
        assert_eq!(info.message, "message text");
        assert_eq!(info.reason.as_deref(), Some("reason text"));
        assert_eq!(info.category, "1000");
        assert_eq!(info.context, "1001");
        assert_eq!(info.exception_obj, "1002");
        assert_eq!(info.args.len(), err.args.len());
        assert_eq!(info.args[0], "1003");
        assert_eq!(info.args[1], "1004");
    }

    #[test]
    fn smallint_helpers_round_trip_and_reject_non_smallints() {
        let oop = smallint_to_oop(-42);

        assert_eq!(oop_to_smallint(oop.clone()).unwrap(), -42);
        assert!(is_smallint_oop(oop).unwrap());
        assert!(!is_smallint_oop(OOP_NIL.to_string()).unwrap());
        assert!(oop_to_smallint(OOP_NIL.to_string()).is_err());
    }

    #[test]
    fn character_helpers_round_trip_and_reject_invalid_inputs() {
        let oop = char_to_oop_string("A".to_string()).unwrap();

        assert_eq!(oop_to_char_string(oop).unwrap(), Some("A".to_string()));
        assert_eq!(oop_to_char_string(OOP_NIL.to_string()).unwrap(), None);
        assert!(char_to_oop_string(String::new()).is_err());
        assert!(char_to_oop_string("AB".to_string()).is_err());
    }

    #[cfg(feature = "session-thread-spike")]
    #[test]
    fn experimental_worker_routes_session_calls_on_worker_thread() {
        let path = std::path::PathBuf::from("/tmp/libgcirpc-placeholder");
        let object_class = 123_456;
        let object = 789_000;
        let synthetic_error = GciErrorInfo {
            number: 2406,
            fatal: false,
            message: "synthetic error".to_string(),
            reason: Some("synthetic reason".to_string()),
            category: "0".to_string(),
            context: "0".to_string(),
            exception_obj: "0".to_string(),
            args: vec![],
        };
        let worker = ExperimentalGciThreadWorker::start_for_path_with_readbacks(
            path.clone(),
            [(OOP_NIL, 0), (i64_to_smallint(42), 0)],
            [(OOP_NIL, object_class)],
            [(("1 + 1".to_string(), OOP_NIL), i64_to_smallint(2))],
            [(
                (
                    object,
                    "at:put:".to_string(),
                    vec![i64_to_smallint(1), object_class],
                ),
                object_class,
            )],
            Some(synthetic_error.clone()),
        )
        .unwrap();

        assert_eq!(worker.library_path().unwrap(), path.display().to_string());
        assert_eq!(worker.fetch_size(OOP_NIL).unwrap(), 0);
        assert_eq!(worker.fetch_class(OOP_NIL).unwrap(), object_class);
        assert_eq!(
            worker.execute_str("1 + 1".to_string(), OOP_NIL).unwrap(),
            i64_to_smallint(2)
        );
        assert_eq!(
            worker
                .perform(
                    object,
                    "at:put:".to_string(),
                    vec![i64_to_smallint(1), object_class]
                )
                .unwrap(),
            object_class
        );
        assert_eq!(worker.err().unwrap(), Some(synthetic_error));
        assert_ne!(
            worker.worker_thread_id_debug().unwrap(),
            format!("{:?}", std::thread::current().id())
        );
    }

    fn write_c_char_array<const N: usize>(target: &mut [c_char; N], value: &str) {
        target.fill(0);
        for (slot, byte) in target.iter_mut().zip(value.bytes()) {
            *slot = byte as c_char;
        }
    }
}
