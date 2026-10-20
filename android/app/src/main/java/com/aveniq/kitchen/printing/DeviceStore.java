package com.aveniq.kitchen.printing;

import android.content.Context;
import android.security.keystore.*;
import android.util.AtomicFile;
import android.util.Base64;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.*;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONObject;

public final class DeviceStore {
  private final File dir;
  private final javax.crypto.SecretKey key;

  public DeviceStore(Context context) throws Exception {
    dir = context.getNoBackupFilesDir();
    KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
    ks.load(null);
    String alias = "aveniq-kitchen-device-v1";
    if (!ks.containsAlias(alias)) {
      KeyGenerator gen = KeyGenerator.getInstance("AES", "AndroidKeyStore");
      gen.init(
          new KeyGenParameterSpec.Builder(
                  alias, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
              .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
              .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
              .build());
      gen.generateKey();
    }
    key = (javax.crypto.SecretKey) ks.getKey(alias, null);
  }

  private AtomicFile file(String name) {
    if (!name.matches("[a-z-]{1,40}")) throw new IllegalArgumentException("STORE_KEY");
    return new AtomicFile(new File(dir, "kitchen-" + name));
  }

  public synchronized void save(String name, JSONObject value) throws Exception {
    Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
    c.init(Cipher.ENCRYPT_MODE, key);
    JSONObject envelope =
        new JSONObject()
            .put("iv", Base64.encodeToString(c.getIV(), Base64.NO_WRAP))
            .put(
                "data",
                Base64.encodeToString(
                    c.doFinal(value.toString().getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP));
    AtomicFile f = file(name);
    FileOutputStream out = f.startWrite();
    try {
      out.write(envelope.toString().getBytes(StandardCharsets.UTF_8));
      f.finishWrite(out);
    } catch (Exception e) {
      f.failWrite(out);
      throw e;
    }
  }

  public synchronized JSONObject load(String name) throws Exception {
    AtomicFile f = file(name);
    if (!f.getBaseFile().exists()) return null;
    try (FileInputStream in = f.openRead()) {
      ByteArrayOutputStream bytes = new ByteArrayOutputStream();
      byte[] buf = new byte[4096];
      int n;
      while ((n = in.read(buf)) >= 0) {
        bytes.write(buf, 0, n);
        if (bytes.size() > 1048576) throw new IOException("STORE_TOO_LARGE");
      }
      JSONObject env = new JSONObject(new String(bytes.toByteArray(), StandardCharsets.UTF_8));
      Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
      c.init(
          Cipher.DECRYPT_MODE,
          key,
          new GCMParameterSpec(128, Base64.decode(env.getString("iv"), Base64.DEFAULT)));
      return new JSONObject(
          new String(
              c.doFinal(Base64.decode(env.getString("data"), Base64.DEFAULT)),
              StandardCharsets.UTF_8));
    }
  }

  public synchronized void remove(String name) {
    file(name).delete();
  }
}
